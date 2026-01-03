
'use server';
/**
 * @fileOverview A Genkit flow for estimating the dispatch date of an order.
 *
 * - estimateDispatchDate - A function that handles the estimation.
 * - EstimateDispatchDateInput - The input type for the function.
 * - EstimateDispatchDateOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import type { Product, Order } from '@/lib/types';
import { format, addDays } from 'date-fns';

const { firestore } = initializeFirebase();
const db = firestore;

const EstimateDispatchDateItemSchema = z.object({
  productId: z.string(),
  quantity: z.number(),
  category: z.string().optional(),
});

const EstimateDispatchDateInputSchema = z.object({
  items: z.array(EstimateDispatchDateItemSchema),
});

export type EstimateDispatchDateInput = z.infer<typeof EstimateDispatchDateInputSchema>;

const EstimateDispatchDateOutputSchema = z.object({
  hasEstimate: z.boolean(),
  estimatedDate: z.string().optional(),
  reasoning: z.string().optional(),
});

export type EstimateDispatchDateOutput = z.infer<typeof EstimateDispatchDateOutputSchema>;

// Helper function to get product data
async function getProducts(productIds: string[]): Promise<Map<string, Product>> {
  const productsMap = new Map<string, Product>();
  if (productIds.length === 0) return productsMap;
  
  const productsRef = collection(db, 'products');
  const q = query(productsRef, where('__name__', 'in', productIds));
  const snapshot = await getDocs(q);
  snapshot.forEach(doc => {
    productsMap.set(doc.id, { id: doc.id, ...doc.data() } as Product);
  });
  return productsMap;
}

// Helper function to get open order demand
async function getOpenOrderDemand(productId: string): Promise<number> {
  const ordersRef = collection(db, 'orders');
  const q = query(ordersRef, where('status', 'in', ['Ordered', 'Manufacturing', 'Awaiting Payment']));
  const snapshot = await getDocs(q);
  
  let totalDemand = 0;
  snapshot.forEach(doc => {
    const order = doc.data() as Order;
    order.items.forEach(item => {
      if (item.productId === productId) {
        totalDemand += item.quantity;
      }
    });
  });
  return totalDemand;
}

export async function estimateDispatchDate(input: EstimateDispatchDateInput): Promise<EstimateDispatchDateOutput> {
  return estimateDispatchDateFlow(input);
}

const estimateDispatchDateFlow = ai.defineFlow(
  {
    name: 'estimateDispatchDateFlow',
    inputSchema: EstimateDispatchDateInputSchema,
    outputSchema: EstimateDispatchDateOutputSchema,
  },
  async (input) => {
    const machineryItems = input.items.filter(item => item.category === 'Plants & Machinery');
    if (machineryItems.length === 0) {
      return { hasEstimate: false };
    }

    const productIds = machineryItems.map(item => item.productId);
    const productsData = await getProducts(productIds);

    let maxProcessingDays = 0;
    let bottleneckItemName = '';

    for (const item of machineryItems) {
      const product = productsData.get(item.productId);
      if (!product) continue;

      const stockOnHand = product.openingStock || 0;
      
      if (item.quantity > stockOnHand) {
        const orderInHand = await getOpenOrderDemand(item.productId);
        const productionQueue = Math.max(0, orderInHand - stockOnHand);
        const shortfall = item.quantity - stockOnHand;
        const totalUnitsToProduce = productionQueue + shortfall;
        
        // 4 days per unit as per the logic
        const processingDays = totalUnitsToProduce * 4;

        if (processingDays > maxProcessingDays) {
          maxProcessingDays = processingDays;
          bottleneckItemName = product.name;
        }
      }
    }

    if (maxProcessingDays > 0) {
      const estimatedDate = addDays(new Date(), maxProcessingDays);
      return {
        hasEstimate: true,
        estimatedDate: format(estimatedDate, 'PPP'),
        reasoning: `Based on current stock and production queue for "${bottleneckItemName}", your order is estimated to ship in approximately ${maxProcessingDays} days.`,
      };
    }

    return { hasEstimate: false };
  }
);
