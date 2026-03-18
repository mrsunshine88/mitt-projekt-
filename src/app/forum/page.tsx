"use client";

import { useUser, useFirestore, useCollection } from '@/firebase';
import { collection, query, orderBy, getDocs, doc, getDoc, limit, onSnapshot } from 'firebase/firestore';
import { useState, useMemo, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, MessageSquare, Plus, Search, Compass, ShieldAlert, Pin } from 'lucide-react';
import Link from 'next/link';
import { firebaseConfig } from '@/firebase/config';
import { formatDistanceToNow } from 'date-fns';
import { sv } from 'date-fns/locale';
import { CreatePostDialog } from '@/components/forum/create-post-dialog';

export default function ForumPage() {
  const { user } = useUser();
  const db = useFirestore();
  const appId = firebaseConfig.projectId;
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'popular' | 'faq'>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) return;
    const postsRef = collection(db, 'artifacts', appId, 'public', 'data', 'forum_posts');
    const q = query(postsRef, orderBy('createdAt', 'desc'), limit(100)); // Hämta de 100 senaste för översikt
    
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPosts(data);
      setLoading(false);
    }, (err) => {
      console.warn('Forum posts snapshot error:', err);
      setLoading(false);
    });
    return () => unsub();
  }, [db, appId]);

  const filteredPosts = useMemo(() => {
    let result = posts;
    if (searchQuery) {
      const lower = searchQuery.toLowerCase();
      result = result.filter(p => p.title.toLowerCase().includes(lower) || p.content.toLowerCase().includes(lower));
    }
    if (filter === 'popular') {
      result = [...result].sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0));
    }
    return result;
  }, [posts, searchQuery, filter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8">
      <header className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-headline font-bold flex items-center gap-3 text-white">
            <MessageSquare className="w-10 h-10 text-blue-400" /> Forum
          </h1>
          <p className="text-slate-400 mt-2">
            Diskutera reparationer, bilar, CarGuard och allmänt skitsnack.
          </p>
        </div>
        {user ? (
          <Button onClick={() => setIsCreateOpen(true)} className="h-12 px-6 rounded-xl font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-xl shadow-blue-500/20">
            <Plus className="w-5 h-5 mr-2" /> Nytt Inlägg
          </Button>
        ) : (
          <Button asChild variant="outline" className="h-12 px-6 rounded-xl font-bold text-slate-300 border-white/10">
            <Link href="/login">Logga in för att skriva</Link>
          </Button>
        )}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="md:col-span-1 space-y-4">
          <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex flex-col gap-2">
            <Button 
              variant={filter === 'all' ? 'secondary' : 'ghost'} 
              className={`w-full justify-start rounded-xl ${filter === 'all' ? 'bg-primary/20 text-blue-400 font-bold' : 'text-slate-400'}`}
              onClick={() => setFilter('all')}
            >
              <Compass className="w-4 h-4 mr-3" /> Senaste
            </Button>
            <Button 
              variant={filter === 'popular' ? 'secondary' : 'ghost'} 
              className={`w-full justify-start rounded-xl ${filter === 'popular' ? 'bg-primary/20 text-blue-400 font-bold' : 'text-slate-400'}`}
              onClick={() => setFilter('popular')}
            >
              <ShieldAlert className="w-4 h-4 mr-3" /> Mest populära
            </Button>
          </div>
        </div>

        {/* Main Feed */}
        <div className="md:col-span-3 space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
            <Input 
              placeholder="Sök i forumet..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-14 pl-12 bg-white/5 border-white/10 rounded-2xl text-lg focus-visible:ring-blue-500"
            />
          </div>

          <div className="flex flex-col gap-4 pt-2">
            {filteredPosts.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center justify-center text-muted-foreground gap-4 bg-white/5 border border-white/5 rounded-3xl">
                <MessageSquare className="w-12 h-12 opacity-20" />
                <p className="text-lg font-bold opacity-60">Inga inlägg hittades</p>
              </div>
            ) : (
              filteredPosts.map(post => (
                <Link key={post.id} href={`/forum/${post.id}`}>
                  <Card className="glass-card p-6 border-white/5 rounded-3xl hover:bg-white/10 transition-colors flex flex-col sm:flex-row gap-4 sm:items-center justify-between group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        {post.isPinned && <Badge className="bg-orange-500/20 text-orange-400 hover:bg-orange-500/20 border-none"><Pin className="w-3 h-3 mr-1" /> Fäst</Badge>}
                        <Badge variant="outline" className="border-white/10 text-slate-300 font-normal">{post.category || 'Allmänt'}</Badge>
                        <span className="text-[10px] text-slate-500 font-medium">
                          {post.createdAt ? formatDistanceToNow(post.createdAt.toDate(), { addSuffix: true, locale: sv }) : ''}
                        </span>
                      </div>
                      <h3 className="text-xl font-bold text-white mb-2 truncate group-hover:text-blue-400 transition-colors">
                        {post.title}
                      </h3>
                      <p className="text-sm text-slate-400 line-clamp-2 leading-relaxed">
                        {post.content}
                      </p>
                    </div>
                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-4 shrink-0 sm:pl-6 sm:border-l border-white/10">
                      <div className="flex items-center gap-4 text-slate-400">
                        <div className="flex flex-col items-center">
                          <MessageSquare className="w-5 h-5 mb-1" />
                          <span className="text-xs font-bold">{post.commentCount || 0}</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <svg className="w-5 h-5 mb-1" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                          <span className="text-xs font-bold">{post.likes?.length || 0}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">av</span>
                        <span className="text-xs font-bold text-slate-300 max-w-[100px] truncate">{post.authorName}</span>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      <CreatePostDialog isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  );
}
