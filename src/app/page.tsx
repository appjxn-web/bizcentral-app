
'use client';

import * as React from 'react';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { HeroBanner } from './_components/hero-banner';
import ShopPageClient from './_components/shop-page-client';
import type { Vacancy, Product, Review } from '@/lib/types';
import { CustomerMap } from './_components/customer-map';
import { Briefcase, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ApplyForJobDialog } from './_components/apply-for-job-dialog';
import { Badge } from '@/components/ui/badge';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import Image from 'next/image';

function HomePageContent() {
  const firestore = useFirestore();
  const [saleableProducts, setSaleableProducts] = React.useState<Product[]>([]);
  const [openVacancies, setOpenVacancies] = React.useState<Vacancy[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function fetchData() {
      if (!firestore) return;

      try {
        const productsQuery = query(collection(firestore, 'products'), where('saleable', '==', true));
        const productsSnapshot = await getDocs(productsQuery);
        const products = productsSnapshot.docs.map(doc => {
            const data = doc.data() as Product;
            const sanitizedReviews = data.reviews?.map(review => {
                const createdAt = review.createdAt as unknown as Timestamp;
                return {
                ...review,
                createdAt: createdAt.toDate().toISOString(),
                };
            }) as Review[] | undefined;
            return { id: doc.id, ...data, reviews: sanitizedReviews };
        });
        setSaleableProducts(products);
        
        const vacanciesQuery = query(collection(firestore, 'vacancies'), where('status', '==', 'Open'));
        const vacanciesSnapshot = await getDocs(vacanciesQuery);
        const vacancies = vacanciesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Vacancy[];
        setOpenVacancies(vacancies);
      } catch (error) {
        console.error("Error fetching homepage data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [firestore]);
  
  if (loading) {
    return (
        <div className="flex items-center justify-center h-screen">
            <Loader2 className="h-12 w-12 animate-spin" />
        </div>
    );
  }

  return (
    <>
      <HeroBanner />
      <div className="py-12 space-y-12">
        <div className="container mx-auto px-4 md:px-6">
            <CustomerMap />
        </div>

        <div className="container mx-auto px-4 md:px-6 space-y-4">
          <div className="flex items-center gap-2">
            <Briefcase className="h-6 w-6" />
            <h2 className="text-2xl font-bold tracking-tight">Job Openings</h2>
          </div>
          {openVacancies && openVacancies.length > 0 ? (
            <Carousel
              opts={{
                align: "start",
              }}
              className="w-full"
            >
              <CarouselContent>
                {openVacancies.map((vacancy) => (
                  <CarouselItem key={vacancy.id} className="md:basis-1/2 lg:basis-1/3">
                    <div className="p-1">
                      <Card className="h-full flex flex-col">
                        <CardHeader>
                          <CardTitle>{vacancy.title}</CardTitle>
                          <CardDescription>{vacancy.department} &middot; {vacancy.location}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex-grow">
                          <p className="text-sm text-muted-foreground line-clamp-3">{vacancy.description}</p>
                        </CardContent>
                        <CardFooter className="flex justify-between">
                          <Badge variant="secondary">{vacancy.type}</Badge>
                          <ApplyForJobDialog vacancy={vacancy} />
                        </CardFooter>
                      </Card>
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious className="ml-12" />
              <CarouselNext className="mr-12"/>
            </Carousel>
          ) : (
             <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                    No open job positions at the moment.
                </CardContent>
            </Card>
          )}
        </div>

        <div className="container mx-auto px-4 md:px-6 space-y-8">
          <ShopPageClient 
            saleableProducts={saleableProducts} 
            openVacancies={openVacancies}
          />
        </div>
      </div>
    </>
  );
}


export default function ShopPage() {
    return <HomePageContent />;
}
