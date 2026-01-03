
'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle } from 'lucide-react';
import Link from 'next/link';

export default function CheckoutSuccessPage() {
  return (
    <div className="max-w-xl mx-auto">
      <Card>
        <CardHeader className="items-center text-center">
          <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
          <CardTitle className="text-2xl font-bold">Order Placed Successfully!</CardTitle>
          <CardDescription>
            Thank you for your purchase. Your order has been booked.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-muted-foreground">
            You will receive a confirmation email shortly. You can track your order status in the "My Orders" section.
          </p>
          <div className="mt-6 flex justify-center gap-4">
            <Button asChild>
                <Link href="/dashboard/my-orders">View My Orders</Link>
            </Button>
             <Button asChild variant="outline">
                <Link href="/dashboard">My Dashboard</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
