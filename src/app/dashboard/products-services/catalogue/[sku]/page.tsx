
'use client';

import * as React from 'react';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '@/components/ui/table';
import { Download, Loader2, Maximize, PlayCircle, Shield, Package, Calendar, ShoppingCart, Heart, Star, Send } from 'lucide-react';
import { notFound } from 'next/navigation';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"
import { Product, UserProfile, Review } from '@/lib/types';
import { QRCodeSVG } from 'qrcode.react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useCollection, useDoc, useUser } from '@/firebase';
import { collection, doc, updateDoc, arrayUnion, arrayRemove, Timestamp } from 'firebase/firestore';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';


const formatIndianCurrency = (num: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

function getStatusBadgeVariant(status: Product['status']) {
    switch (status) {
        case 'Active':
            return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
        case 'Pre Sale':
            return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
        case 'R & D':
            return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
        case 'Discontinued':
            return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
        default:
            return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
}

const StarRating = ({ rating, size = 'md' }: { rating: number, size?: 'sm' | 'md' }) => {
    const starClasses = size === 'sm' ? "h-4 w-4" : "h-5 w-5";
    return (
        <div className="flex items-center">
        {[...Array(5)].map((_, i) => (
            <Star
            key={i}
            className={cn(
                starClasses,
                i < Math.floor(rating) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300 dark:text-gray-600'
            )}
            />
        ))}
        </div>
    );
};

const VideoPlayer = ({ src }: { src: string }) => {
    // Check if it's a YouTube URL
    if (src.includes('youtube.com') || src.includes('youtu.be')) {
        let videoId;
        if (src.includes('youtu.be')) {
            videoId = src.split('/').pop();
        } else {
            try {
                const url = new URL(src);
                videoId = url.searchParams.get('v');
            } catch (e) {
                // Invalid URL, treat as direct link
                videoId = null;
            }
        }

        if (videoId) {
            const embedUrl = `https://www.youtube.com/embed/${videoId}`;
            return (
                <iframe
                    key={src}
                    className="w-full aspect-video rounded-md"
                    src={embedUrl}
                    title="YouTube video player"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                ></iframe>
            );
        }
    }

    // Fallback to standard video tag for direct links
    return <video key={src} src={src} controls className="w-full rounded-md" />;
};

export default function ProductDetailPage() {
    const params = useParams();
    const sku = params?.sku as string;
    const firestore = useFirestore();
    const { user } = useUser();
    const { data: allProducts, loading: productsLoading } = useCollection<Product>(collection(firestore, 'products'));
    const { data: companyInfo, loading: companyInfoLoading } = useDoc<{logo?: string, companyName?: string, contactEmail?: string, contactNumber?: string, aboutUs?: string, website?: string}>(doc(firestore, 'company', 'info'));
    const userProfileRef = user ? doc(firestore, 'users', user.uid) : null;
    const { data: userProfile } = useDoc<UserProfile>(userProfileRef);

    const [youtubeUrl, setYoutubeUrl] = React.useState('');
    const pdfRef = React.useRef<HTMLDivElement>(null);
    const [isDownloading, setIsDownloading] = React.useState(false);
    const { toast } = useToast();
    
    const [userRating, setUserRating] = React.useState(0);
    const [userComment, setUserComment] = React.useState('');
    const [isSubmittingReview, setIsSubmittingReview] = React.useState(false);

    const product = React.useMemo(() => {
        if (productsLoading || !allProducts) return undefined;
        return allProducts.find(p => p.sku === sku) || null;
    }, [sku, allProducts, productsLoading]);

    const isWishlisted = React.useMemo(() => {
        return userProfile?.wishlist?.includes(product?.id || '') || false;
    }, [userProfile, product]);
    
    React.useEffect(() => {
        const storedYoutubeUrl = localStorage.getItem('socialYoutube');
        if (storedYoutubeUrl) {
            setYoutubeUrl(storedYoutubeUrl);
        }
    }, []);
    
    const media = {
        hero: product?.imageUrl || 'https://picsum.photos/seed/product/1080/1080',
        optional1: product?.imageUrl2 || 'https://picsum.photos/seed/chair-angle/1080/1080',
        optional2: product?.imageUrl3 ||'https://picsum.photos/seed/chair-fabric/1080/1080',
        optional3: product?.imageUrl4 ||'https://picsum.photos/seed/chair-features/1080/1080',
        video: product?.videoUrl || 'https://www.w3schools.com/html/mov_bbb.mp4'
    };
    
    const reviewStats = React.useMemo(() => {
        if (!product?.reviews || product.reviews.length === 0) {
            return { average: 0, count: 0 };
        }
        const totalRating = product.reviews.reduce((acc, review) => acc + review.rating, 0);
        return {
            average: totalRating / product.reviews.length,
            count: product.reviews.length,
        };
    }, [product]);

    const handleDownloadPdf = async () => {
        const element = pdfRef.current;
        if (!element) return;
        setIsDownloading(true);
        const canvas = await html2canvas(element, { scale: 2, useCORS: true });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const imgWidth = canvas.width;
        const imgHeight = canvas.height;
        const ratio = imgWidth / imgHeight;
        let imgPdfWidth = pdfWidth;
        let imgPdfHeight = pdfWidth / ratio;
        if (imgPdfHeight > pdfHeight) {
            imgPdfHeight = pdfHeight;
            imgPdfWidth = pdfHeight * ratio;
        }
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, imgPdfHeight);
        pdf.save(`Product-Sheet-${product?.sku}.pdf`);
        setIsDownloading(false);
    };

    if (productsLoading || companyInfoLoading || product === undefined) {
        return (
             <PageHeader title="Loading Product...">
                <div className="flex items-center justify-center">
                    <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                </div>
            </PageHeader>
        )
    }

    if (product === null) {
        notFound();
    }
    
    const companyDetails = {
      name: companyInfo?.companyName || 'BizCentral',
      contact: {
        email: companyInfo?.contactEmail || 'contact@example.com',
        website: companyInfo?.website || 'www.example.com'
      },
      logo: companyInfo?.logo || 'https://placehold.co/200x60/eee/ccc.png?text=Your+Logo',
    }

    const addToCart = (productToAdd: Product) => {
      const cart = JSON.parse(localStorage.getItem('cart') || '[]');
      const existingItem = cart.find((item: Product & {quantity: number}) => item.id === productToAdd.id);
      if (existingItem) {
        existingItem.quantity += 1;
      } else {
        cart.push({...productToAdd, quantity: 1});
      }
      localStorage.setItem('cart', JSON.stringify(cart));
      window.dispatchEvent(new CustomEvent('cartUpdated'));
      toast({
        title: 'Added to Cart',
        description: `${productToAdd.name} has been added to your cart.`,
      });
    };
    
    const handleWishlistToggle = async () => {
        if (!user || !product) {
            toast({ variant: 'destructive', title: 'You must be logged in to wishlist items.' });
            return;
        }
        if (!userProfileRef) return;

        try {
            if (isWishlisted) {
                await updateDoc(userProfileRef, { wishlist: arrayRemove(product.id) });
                toast({ title: 'Removed from Wishlist' });
            } else {
                await updateDoc(userProfileRef, { wishlist: arrayUnion(product.id) });
                toast({ title: 'Added to Wishlist' });
            }
        } catch (error) {
            console.error("Error updating wishlist:", error);
            toast({ variant: 'destructive', title: 'Could not update wishlist.' });
        }
    };
    
    const handleReviewSubmit = async () => {
        if (!user || !product) {
            toast({ variant: 'destructive', title: 'You must be logged in to submit a review.' });
            return;
        }
        if (userRating === 0) {
            toast({ variant: 'destructive', title: 'Rating Required', description: 'Please select a star rating.' });
            return;
        }

        setIsSubmittingReview(true);
        try {
            const newReview: Review = {
                id: `rev_${user.uid}_${Date.now()}`,
                userId: user.uid,
                userName: user.displayName || 'Anonymous',
                userAvatar: user.photoURL || '',
                rating: userRating,
                comment: userComment,
                createdAt: Timestamp.now(),
            };
            
            const productRef = doc(firestore, 'products', product.id);
            await updateDoc(productRef, { reviews: arrayUnion(newReview) });
            
            toast({ title: 'Review Submitted', description: 'Thank you for your feedback!' });
            setUserRating(0);
            setUserComment('');

        } catch (error) {
            console.error("Error submitting review:", error);
            toast({ variant: 'destructive', title: 'Submission Failed', description: 'Could not submit your review.' });
        } finally {
            setIsSubmittingReview(false);
        }
    }


    return (
        <>
            <PageHeader title={product.name}>
                <Button onClick={handleDownloadPdf} disabled={isDownloading}>
                    {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    Download PDF
                </Button>
            </PageHeader>
            <div className="bg-background" ref={pdfRef}>
                <Card className="shadow-none border-none rounded-none">
                <CardContent className="p-8">
                    {/* Header */}
                    <header className="flex justify-between items-start border-b pb-4">
                        <div>
                            <Image src={companyDetails.logo} alt="Company Logo" width={150} height={45} />
                        </div>
                        <div className="text-right">
                            <h1 className="text-2xl font-bold text-primary">{product.name}</h1>
                            <p className="text-sm text-muted-foreground">{product.modelNumber}</p>
                        </div>
                    </header>

                    {/* Main Content */}
                    <div className="grid md:grid-cols-2 gap-8 my-8">
                        {/* Image & Video Gallery */}
                        <div className="space-y-4">
                             <div className="aspect-square w-full bg-muted rounded-lg overflow-hidden border">
                                <Image src={media.hero} alt={product.name} width={600} height={600} className="object-cover w-full h-full" data-ai-hint={product.imageHint} />
                            </div>
                            <Carousel className="w-full">
                                <CarouselContent>
                                    {media.optional1 && <CarouselItem className="basis-1/3"><Image src={media.optional1} alt="Optional view 1" width={200} height={200} className="rounded-md border object-cover w-full aspect-square" /></CarouselItem>}
                                    {media.optional2 && <CarouselItem className="basis-1/3"><Image src={media.optional2} alt="Optional view 2" width={200} height={200} className="rounded-md border object-cover w-full aspect-square" /></CarouselItem>}
                                    {media.optional3 && <CarouselItem className="basis-1/3"><Image src={media.optional3} alt="Optional view 3" width={200} height={200} className="rounded-md border object-cover w-full aspect-square" /></CarouselItem>}
                                </CarouselContent>
                            </Carousel>
                        </div>

                        {/* Product Details */}
                        <div className="space-y-6">
                            <div>
                                {product.heroLine && <p className="text-lg font-semibold text-primary mb-2">{product.heroLine}</p>}
                                <div className="flex items-baseline gap-2">
                                    <p className="text-3xl font-bold text-primary">{formatIndianCurrency(product.price)}</p>
                                    <span className="text-xl font-semibold text-muted-foreground">/ {product.unit}</span>
                                </div>
                                <span className="text-sm text-muted-foreground ml-1">(+18% GST+shipping)</span>
                            </div>
                            <div className="flex gap-2">
                                <Button size="lg" className="w-full" onClick={() => addToCart(product)}>
                                    <ShoppingCart className="mr-2 h-5 w-5" />
                                    Add to Cart
                                </Button>
                                <Button size="lg" variant="outline" onClick={handleWishlistToggle}>
                                    <Heart className={cn("h-5 w-5", isWishlisted && "fill-red-500 text-red-500")} />
                                </Button>
                             </div>
                            <p className="text-muted-foreground">{product.description.split('. ')[0] + '.'}</p>
                            
                            <Card>
                                <CardContent className="p-4">
                                <Table>
                                    <TableBody>
                                        <TableRow><TableCell className="font-medium">SKU</TableCell><TableCell>{product.sku}</TableCell></TableRow>
                                        <TableRow><TableCell className="font-medium">Category</TableCell><TableCell>{product.category}</TableCell></TableRow>
                                        <TableRow><TableCell className="font-medium">Type</TableCell><TableCell>{product.type}</TableCell></TableRow>
                                        <TableRow><TableCell className="font-medium">Status</TableCell><TableCell><Badge variant="outline" className={cn('text-xs', getStatusBadgeVariant(product.status))}>{product.status}</Badge></TableCell></TableRow>
                                    </TableBody>
                                </Table>
                                </CardContent>
                            </Card>
                            {media.video && (
                               <div className="aspect-video w-full">
                                    <VideoPlayer src={media.video} />
                               </div>
                            )}
                        </div>
                    </div>

                    <div className="my-8">
                        <h3 className="font-bold text-lg mb-2">Features</h3>
                        <ul className="list-disc list-inside text-muted-foreground space-y-1 text-sm">
                            {product.description.split('. ').map((feature, index) => (
                                feature && <li key={index}>{feature}</li>
                            ))}
                        </ul>
                    </div>
                    
                    <Separator />
                    
                    {/* Specifications & Warranty */}
                    <div className="grid md:grid-cols-2 gap-8 my-8">
                        <div>
                            <h3 className="font-bold text-lg mb-2 flex items-center gap-2"><Package className="h-5 w-5" /> Specifications</h3>
                             <Table>
                                <TableBody>
                                    <TableRow><TableCell className="font-medium text-muted-foreground">Source</TableCell><TableCell>{product.source}</TableCell></TableRow>
                                    <TableRow><TableCell className="font-medium text-muted-foreground">Version</TableCell><TableCell>{product.version}</TableCell></TableRow>
                                    <TableRow><TableCell className="font-medium text-muted-foreground">Model Number</TableCell><TableCell>{product.modelNumber}</TableCell></TableRow>
                                </TableBody>
                            </Table>
                        </div>
                        <div className="space-y-4">
                             <h3 className="font-bold text-lg mb-2 flex items-center gap-2"><Shield className="h-5 w-5" /> Warranty Information</h3>
                             <Table>
                                <TableBody>
                                    <TableRow>
                                        <TableCell className="font-medium text-muted-foreground">Product Warranty</TableCell>
                                        <TableCell>{product.warranty?.months || 0} months</TableCell>
                                    </TableRow>
                                    {product.warranty?.childParts?.map((part, index) => (
                                         <TableRow key={index}>
                                            <TableCell className="font-medium text-muted-foreground pl-8">{part.name}</TableCell>
                                            <TableCell>{part.months} months</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                    
                    <Separator />

                    {/* Reviews Section */}
                    <div className="my-8">
                         <h3 className="font-bold text-lg mb-4">Customer Reviews</h3>
                        <div className="flex flex-col md:flex-row gap-8">
                            <div className="md:w-1/3 text-center">
                                <p className="text-4xl font-bold">{reviewStats.average.toFixed(1)}</p>
                                <StarRating rating={reviewStats.average} />
                                <p className="text-sm text-muted-foreground mt-1">Based on {reviewStats.count} reviews</p>
                            </div>
                            <div className="md:w-2/3">
                                {user && (
                                    <Card className="mb-6">
                                        <CardHeader>
                                            <CardTitle>Write a review</CardTitle>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium">Your Rating:</span>
                                                <div className="flex">
                                                    {[1, 2, 3, 4, 5].map((star) => (
                                                        <Star
                                                            key={star}
                                                            className={cn("h-6 w-6 cursor-pointer", star <= userRating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300 dark:text-gray-600')}
                                                            onClick={() => setUserRating(star)}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                            <Textarea placeholder="Share your thoughts on this product..." value={userComment} onChange={(e) => setUserComment(e.target.value)} />
                                            <Button onClick={handleReviewSubmit} disabled={isSubmittingReview}>
                                                {isSubmittingReview && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                Submit Review
                                            </Button>
                                        </CardContent>
                                    </Card>
                                )}
                                <div className="space-y-4">
                                    {product.reviews?.map(review => (
                                        <div key={review.id} className="flex gap-4 border-b pb-4">
                                            <Avatar>
                                                <AvatarImage src={review.userAvatar} />
                                                <AvatarFallback>{review.userName.charAt(0)}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <p className="font-semibold">{review.userName}</p>
                                                    <StarRating rating={review.rating} size="sm" />
                                                </div>
                                                <p className="text-sm text-muted-foreground">{review.comment}</p>
                                            </div>
                                        </div>
                                    ))}
                                    {reviewStats.count === 0 && <p className="text-sm text-muted-foreground">No reviews yet.</p>}
                                </div>
                            </div>
                        </div>
                    </div>

                    {youtubeUrl && (
                        <div className="my-8 text-center">
                            <Separator />
                            <h3 className="font-bold text-lg mt-8 mb-4">Scan for Our YouTube Channel</h3>
                            <div className="flex justify-center">
                                <QRCodeSVG value={youtubeUrl} size={128} />
                            </div>
                        </div>
                    )}
                    
                     <footer className="text-center text-xs text-muted-foreground pt-8 border-t">
                        <p>{companyDetails.name} | {companyDetails.contact.email} | {companyDetails.contact.website}</p>
                    </footer>

                </CardContent>
                </Card>
            </div>
        </>
    );
}
