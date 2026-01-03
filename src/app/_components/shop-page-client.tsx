
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ShoppingCart, Briefcase, ThumbsUp, ThumbsDown, Search, Share2, Maximize, Phone, Building, Loader2 } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ApplyForJobDialog } from './apply-for-job-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { Product, Vacancy, User } from '@/lib/types';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { useToast } from '@/hooks/use-toast';
import { PostDetailsDialog } from './post-details-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { useFirestore } from '@/firebase';
import { collection, query, where, doc, updateDoc, increment, getDoc, getDocs, onSnapshot, orderBy } from 'firebase/firestore';

interface Post {
    id: string;
    authorId: string;
    authorName: string;
    authorAvatar: string;
    content: string;
    mediaUrl: string;
    mediaType: 'image' | 'video';
    likes: number;
    dislikes: number;
    submittedAt: string;
    businessName: string;
    location: string;
    mobile: string;
}

interface CartItem extends Product {
  quantity: number;
}


interface ShopPageClientProps {
    saleableProducts: Product[];
    openVacancies: Vacancy[];
}

function MediaViewerDialog({ mediaUrl, mediaType, alt, open, onOpenChange }: { mediaUrl: string; mediaType: 'image' | 'video'; alt: string; open: boolean; onOpenChange: (open: boolean) => void; }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Media Viewer</DialogTitle>
          <DialogDescription>Displays the selected image or video in a larger view.</DialogDescription>
        </DialogHeader>
        {mediaType === 'image' ? (
          <Image src={mediaUrl} alt={alt} width={1200} height={900} className="rounded-lg object-contain" />
        ) : (
          <video src={mediaUrl} className="w-full rounded-lg" controls autoPlay />
        )}
      </DialogContent>
    </Dialog>
  );
}

const PostMedia = ({ mediaUrl, mediaType, alt }: { mediaUrl: string; mediaType: 'image' | 'video'; alt: string }) => {
    if (mediaType === 'image') {
      return <Image src={mediaUrl} alt={alt} width={400} height={300} className="object-cover w-full h-full" />;
    }
  
    return (
      <video
        src={mediaUrl}
        className="object-cover w-full h-full"
        loop
        playsInline
        controls
      />
    );
  };

const formatIndianCurrency = (num: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

export default function ShopPageClient({ saleableProducts, openVacancies }: ShopPageClientProps) {
  const firestore = useFirestore();
  const [posts, setPosts] = React.useState<Post[] | null>(null);
  const [postsLoading, setPostsLoading] = React.useState(true);

  const [searchTerm, setSearchTerm] = React.useState('');
  const [categoryFilter, setCategoryFilter] = React.useState('All');
  const [selectedPostForDetails, setSelectedPostForDetails] = React.useState<Post | null>(null);
  const [selectedMedia, setSelectedMedia] = React.useState<{ url: string; type: 'image' | 'video'; alt: string} | null>(null);
  const [postVotes, setPostVotes] = React.useState<Record<string, 'like' | 'dislike' | null>>({});
  const { toast } = useToast();
  
  React.useEffect(() => {
    if (!firestore) return;

    setPostsLoading(true);
    const postsQuery = query(
        collection(firestore, 'posts'), 
        where('status', '==', 'Approved'),
        orderBy('submittedAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(postsQuery, (snapshot) => {
        const approvedPosts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Post[];
        setPosts(approvedPosts);
        setPostsLoading(false);
    }, (error) => {
        console.error("Error fetching posts:", error);
        setPostsLoading(false);
    });

    return () => unsubscribe();
  }, [firestore]);


  const handleLike = async (postId: string, type: 'like' | 'dislike') => {
    if (!posts || !firestore) return;
    const postRef = doc(firestore, 'posts', postId);
    const currentVote = postVotes[postId];
    const postToUpdate = posts.find(p => p.id === postId);

    if (!postToUpdate) return;
    
    let likesIncrement = 0;
    let dislikesIncrement = 0;

    if (type === 'like') {
        if (currentVote === 'like') { // Unliking
            likesIncrement = -1;
            setPostVotes(prev => ({ ...prev, [postId]: null }));
        } else { // Liking
            likesIncrement = 1;
            if (currentVote === 'dislike' && postToUpdate.dislikes > 0) dislikesIncrement = -1;
            setPostVotes(prev => ({ ...prev, [postId]: 'like' }));
        }
    } else { // Disliking
        if (currentVote === 'dislike') { // Undisliking
            dislikesIncrement = -1;
            setPostVotes(prev => ({ ...prev, [postId]: null }));
        } else { // Disliking
            dislikesIncrement = 1;
            if (currentVote === 'like' && postToUpdate.likes > 0) likesIncrement = -1;
            setPostVotes(prev => ({ ...prev, [postId]: 'dislike' }));
        }
    }

    // Optimistically update the UI
    setPosts(prevPosts =>
      prevPosts!.map(post => {
        if (post.id === postId) {
          return { ...post, likes: post.likes + likesIncrement, dislikes: post.dislikes + dislikesIncrement };
        }
        return post;
      })
    );

    // Persist the change to Firestore
    try {
      await updateDoc(postRef, {
        likes: increment(likesIncrement),
        dislikes: increment(dislikesIncrement),
      });
    } catch (error) {
      console.error("Error updating likes:", error);
      // Revert the UI change on error
      setPosts(prevPosts =>
        prevPosts!.map(post => {
          if (post.id === postId) {
            return { ...post, likes: post.likes - likesIncrement, dislikes: post.dislikes - dislikesIncrement };
          }
          return post;
        })
      );
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not update your vote.',
      });
    }
  };
  
  const handleShare = (postId: string) => {
    const postUrl = `${window.location.origin}/post/${postId}`;
    navigator.clipboard.writeText(postUrl).then(() => {
      toast({
        title: 'Link Copied',
        description: 'The post link has been copied to your clipboard.',
      });
    });
  };

  const topProducts = saleableProducts.slice(0, 2);

  const allCategories = React.useMemo(() => {
    const categories = new Set(saleableProducts.map(p => p.category));
    return ['All', ...Array.from(categories)];
  }, [saleableProducts]);

  const filteredProducts = React.useMemo(() => {
    return saleableProducts.filter(product => {
      const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            product.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = categoryFilter === 'All' || product.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [saleableProducts, searchTerm, categoryFilter]);
  
  const groupedProducts = React.useMemo(() => {
    return filteredProducts.reduce((acc, product) => {
      const category = product.category || 'Uncategorized';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(product);
      return acc;
    }, {} as Record<string, Product[]>);
  }, [filteredProducts]);

  const sortedPosts = React.useMemo(() => {
    if (!posts) return [];
    // Data is already sorted by query
    return posts;
  }, [posts]);

  const addToCart = (product: Product) => {
    const cart: CartItem[] = JSON.parse(localStorage.getItem('cart') || '[]');
    const existingItemIndex = cart.findIndex(item => item.id === product.id);

    if (existingItemIndex > -1) {
      cart[existingItemIndex].quantity += 1;
    } else {
      cart.push({ ...product, quantity: 1 });
    }
    
    localStorage.setItem('cart', JSON.stringify(cart));
    window.dispatchEvent(new CustomEvent('cartUpdated'));
    toast({
      title: 'Added to Cart',
      description: `${product.name} has been added to your cart.`,
    });
  };


  return (
    <>
      <div className="space-y-8 pt-8">
        {topProducts.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold tracking-tight mb-4">Top Selling Products</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {topProducts.map((product) => (
                <Link key={product.id} href={`/dashboard/products-services/catalogue/${product.sku}`} className="block transition-all hover:scale-[1.02] cursor-pointer">
                  <Card className="flex flex-col h-full">
                    <CardHeader className="p-0">
                      <div className="relative w-full h-64">
                        <Image
                          src={product.imageUrl}
                          alt={product.name}
                          fill
                          className="object-cover rounded-t-lg"
                          data-ai-hint={product.imageHint}
                        />
                      </div>
                    </CardHeader>
                    <CardContent className="p-6 flex-grow">
                      <CardTitle className="text-xl font-bold mb-2">{product.name}</CardTitle>
                      {product.heroLine && <p className="text-primary text-sm font-semibold mb-2">{product.heroLine}</p>}
                      <CardDescription className="text-base text-muted-foreground line-clamp-3">
                        {product.description}
                      </CardDescription>
                    </CardContent>
                    <CardFooter className="p-6 flex justify-between items-center">
                      <p className="text-2xl font-extrabold text-primary">{formatIndianCurrency(product.price)}</p>
                      <Button size="lg" onClick={(e) => { e.preventDefault(); e.stopPropagation(); addToCart(product); }}>
                        <ShoppingCart className="mr-2 h-5 w-5" />
                        Add to Cart
                      </Button>
                    </CardFooter>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}
        
        <Separator className="my-8" />
        <div className="space-y-4">
            <h2 className="text-2xl font-bold tracking-tight">Community Posts</h2>
            {postsLoading ? (
                 <div className="flex items-center justify-center h-48"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : sortedPosts.length > 0 ? (
                <Carousel
                    opts={{ align: "start" }}
                    className="w-full"
                >
                    <CarouselContent>
                    {sortedPosts.map((post) => (
                        <CarouselItem key={post.id} className="sm:basis-1/2 lg:basis-1/3">
                            <div className="p-1 h-full">
                                <Card className="flex flex-col h-full">
                                <CardContent className="p-4 flex-grow">
                                    <div className="flex items-start gap-4">
                                    <div
                                        className="cursor-pointer"
                                        onClick={() => setSelectedPostForDetails(post)}
                                    >
                                        <Avatar>
                                        <AvatarImage src={post.authorAvatar} />
                                        <AvatarFallback>{post.authorName.charAt(0)}</AvatarFallback>
                                        </Avatar>
                                    </div>
                                    <div className="flex-1">
                                        <p
                                        className="font-semibold cursor-pointer"
                                        onClick={() => setSelectedPostForDetails(post)}
                                        >
                                        {post.authorName}
                                        </p>
                                        <p className="text-sm text-muted-foreground">{post.content}</p>
                                    </div>
                                    </div>
                                </CardContent>
                                {post.mediaUrl && (
                                    <div 
                                    className="mt-2 rounded-lg border overflow-hidden aspect-video relative cursor-pointer"
                                    onClick={() => setSelectedMedia({ url: post.mediaUrl, type: post.mediaType, alt: `Media for post by ${post.authorName}`})}
                                    >
                                    <PostMedia mediaUrl={post.mediaUrl} mediaType={post.mediaType} alt={`Media for post by ${post.authorName}`} />
                                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                                        <Maximize className="h-8 w-8 text-white" />
                                    </div>
                                    </div>
                                )}
                                <CardFooter className="p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                    <Button variant="ghost" size="sm" className="flex items-center gap-1" onClick={(e) => { e.stopPropagation(); handleLike(post.id, 'like'); }}>
                                        <ThumbsUp className={`h-4 w-4 ${postVotes[post.id] === 'like' ? 'text-primary' : ''}`} /> {post.likes}
                                    </Button>
                                    <Button variant="ghost" size="sm" className="flex items-center gap-1" onClick={(e) => { e.stopPropagation(); handleLike(post.id, 'dislike'); }}>
                                        <ThumbsDown className={`h-4 w-4 ${postVotes[post.id] === 'dislike' ? 'text-destructive' : ''}`} /> {post.dislikes}
                                    </Button>
                                    </div>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); handleShare(post.id); }}>
                                    <Share2 className="h-4 w-4" />
                                    </Button>
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
                        No community posts to show right now.
                    </CardContent>
                </Card>
            )}
        </div>

        {saleableProducts.length > 0 && (
           <div>
            <Separator className="my-8" />
            <h2 className="text-2xl font-bold tracking-tight mb-4">All Products</h2>
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="relative w-full md:w-1/2 lg:w-2/3">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search products..."
                  className="pl-8 w-full"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full md:w-1/2 lg:w-1/3">
                  <SelectValue placeholder="Filter by category" />
                </SelectTrigger>
                <SelectContent>
                  {allCategories.map(category => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
             
             <div className="space-y-12">
              {Object.keys(groupedProducts).length > 0 ? (
                Object.entries(groupedProducts).map(([category, products]) => (
                  <div key={category}>
                    <h3 className="text-xl font-bold tracking-tight mb-4">{category}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                      {products.map(product => (
                          <Link key={product.id} href={`/dashboard/products-services/catalogue/${product.sku}`} className="block transition-all hover:scale-[1.02]">
                            <Card className="flex flex-col h-full cursor-pointer">
                              <CardHeader className="p-0">
                                <div className="relative w-full h-48">
                                  <Image
                                    src={product.imageUrl}
                                    alt={product.name}
                                    fill
                                    className="object-cover rounded-t-lg"
                                    data-ai-hint={product.imageHint}
                                  />
                                </div>
                              </CardHeader>
                              <CardContent className="p-4 flex-grow">
                                <CardTitle className="text-lg font-semibold mb-2">{product.name}</CardTitle>
                                {product.heroLine && <p className="text-primary text-xs font-semibold mb-1">{product.heroLine}</p>}
                                <CardDescription className="text-sm text-muted-foreground line-clamp-2">
                                  {product.description}
                                </CardDescription>
                              </CardContent>
                              <CardFooter className="p-4 flex justify-between items-center">
                                <p className="text-xl font-bold text-primary">{formatIndianCurrency(product.price)}</p>
                                <Button size="sm" onClick={(e) => { e.preventDefault(); e.stopPropagation(); addToCart(product); }}>
                                  <ShoppingCart className="mr-2 h-4 w-4" />
                                  Add to Cart
                                </Button>
                              </CardFooter>
                            </Card>
                          </Link>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <p>No products found matching your criteria.</p>
                </div>
              )}
             </div>
          </div>
        )}
      </div>
      
      {selectedPostForDetails && (
        <PostDetailsDialog post={selectedPostForDetails} open={!!selectedPostForDetails} onOpenChange={() => setSelectedPostForDetails(null)} />
      )}
      {selectedMedia && (
        <MediaViewerDialog
          mediaUrl={selectedMedia.url}
          mediaType={selectedMedia.type}
          alt={selectedMedia.alt}
          open={!!selectedMedia}
          onOpenChange={() => setSelectedMedia(null)}
        />
      )}
    </>
  );
}
