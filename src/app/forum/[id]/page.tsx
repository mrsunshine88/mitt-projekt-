"use client";

import { use, useState, useEffect, useMemo } from 'react';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc, getDoc, collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, updateDoc, arrayUnion, arrayRemove, writeBatch, deleteDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Loader2, MessageSquare, Heart, CornerDownRight, Trash2, ArrowLeft, Send, ShieldAlert, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { firebaseConfig } from '@/firebase/config';
import { formatDistanceToNow } from 'date-fns';
import { sv } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserProfile } from '@/types/autolog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

export default function ForumPostPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params);
  const { id } = unwrappedParams;
  
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const appId = firebaseConfig.projectId;

  const [post, setPost] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const profileRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'artifacts', appId, 'public', 'data', 'public_profiles', user.uid);
  }, [db, user, appId]);
  const { data: profile } = useDoc<UserProfile>(profileRef);

  const isAdmin = useMemo(() => 
    user?.email === 'apersson508@gmail.com' || 
    profile?.role === 'Huvudadmin' || 
    profile?.role === 'Moderator', 
  [user, profile]);

  const isBanned = profile?.isForumBanned || false;

  useEffect(() => {
    if (!db) return;
    
    // Listen to Post
    const postRef = doc(db, 'artifacts', appId, 'public', 'data', 'forum_posts', id);
    const unsubPost = onSnapshot(postRef, (snap) => {
      if (snap.exists()) {
        setPost({ id: snap.id, ...snap.data() });
      } else {
        setPost(null);
      }
      setLoading(false);
    });

    // Listen to Comments
    const commentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'forum_comments');
    const q = query(commentsRef, orderBy('createdAt', 'asc'));
    const unsubComments = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((c: any) => c.postId === id);
      setComments(data);
    });

    return () => { unsubPost(); unsubComments(); };
  }, [db, id, appId]);

  const handleToggleLikePost = async () => {
    if (!user || !db || !post) return;
    const isLiked = post.likes?.includes(user.uid);
    const postRef = doc(db, 'artifacts', appId, 'public', 'data', 'forum_posts', id);
    
    try {
      if (isLiked) {
        await updateDoc(postRef, { likes: arrayRemove(user.uid) });
      } else {
        const batch = writeBatch(db);
        batch.update(postRef, { likes: arrayUnion(user.uid) });

        if (user.uid !== post.authorId) {
          const notifRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'user_notifications'));
          batch.set(notifRef, {
            userId: post.authorId,
            type: 'post_like',
            message: `${user.displayName || 'Någon'} gillade ditt inlägg "${post.title}"`,
            link: `/forum/${id}`,
            read: false,
            createdAt: serverTimestamp()
          });
        }
        await batch.commit();
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fel vid gillamarkering", description: err.message });
    }
  };

  const handleToggleLikeComment = async (comment: any) => {
    if (!user || !db) return;
    const isLiked = comment.likes?.includes(user.uid);
    const commentRef = doc(db, 'artifacts', appId, 'public', 'data', 'forum_comments', comment.id);
    
    try {
      if (isLiked) {
        await updateDoc(commentRef, { likes: arrayRemove(user.uid) });
      } else {
        const batch = writeBatch(db);
        batch.update(commentRef, { likes: arrayUnion(user.uid) });

        if (user.uid !== comment.authorId) {
          const notifRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'user_notifications'));
          batch.set(notifRef, {
            userId: comment.authorId,
            type: 'comment_like',
            message: `${user.displayName || 'Någon'} gillade din kommentar`,
            link: `/forum/${id}`,
            read: false,
            createdAt: serverTimestamp()
          });
        }
        await batch.commit();
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fel vid gillamarkering", description: err.message });
    }
  };

  const handlePostComment = async () => {
    if (!user || !db || !post) return;
    if (isBanned) {
      toast({ variant: "destructive", title: "Spärrad", description: "Du är spärrad från forumet." });
      return;
    }
    if (newComment.trim().length < 2) return;

    setIsSubmitting(true);
    try {
      const batch = writeBatch(db);
      
      const commentRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'forum_comments'));
      batch.set(commentRef, {
        postId: id,
        content: newComment.trim(),
        authorId: user.uid,
        authorName: user.displayName || 'Anonym Användare',
        authorPhoto: user.photoURL || null,
        likes: [],
        createdAt: serverTimestamp()
      });

      const postRef = doc(db, 'artifacts', appId, 'public', 'data', 'forum_posts', id);
      batch.update(postRef, {
        commentCount: (post.commentCount || 0) + 1,
        updatedAt: serverTimestamp()
      });

      if (user.uid !== post.authorId) {
        const notifRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'user_notifications'));
        batch.set(notifRef, {
          userId: post.authorId,
          type: 'post_comment',
          message: `${user.displayName || 'Någon'} kommenterade på "${post.title}"`,
          link: `/forum/${id}`,
          read: false,
          createdAt: serverTimestamp()
        });
      }

      await batch.commit();
      setNewComment('');
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fel", description: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePost = async () => {
    if (!db || !user || !isAdmin || !post) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'forum_posts', id));
      comments.forEach(c => batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'forum_comments', c.id)));
      
      const logRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'admin_audit_logs'));
      batch.set(logRef, {
        actionType: 'DELETED_FORUM_POST',
        adminId: user.uid,
        adminName: user.displayName || user.email || 'Admin',
        targetId: id,
        details: `Raderade inlägget "${post.title}" från ${post.authorName}`,
        createdAt: serverTimestamp()
      });

      await batch.commit();
      toast({ title: "Inlägg raderat." });
      window.location.href = '/forum';
    } catch (err: any) {
      toast({ variant: "destructive", title: "Gick inte att radera", description: err.message });
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!db || !user || !isAdmin || !post) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'forum_comments', commentId));
      batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'forum_posts', id), {
        commentCount: Math.max((post.commentCount || 1) - 1, 0)
      });

      const logRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'admin_audit_logs'));
      batch.set(logRef, {
        actionType: 'DELETED_FORUM_COMMENT',
        adminId: user.uid,
        adminName: user.displayName || user.email || 'Admin',
        targetId: commentId,
        details: `Raderade i post "${post.title}" kommentar från en användare`,
        createdAt: serverTimestamp()
      });

      await batch.commit();
      toast({ title: "Kommentar raderad." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fel", description: err.message });
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!post && !loading) return <div className="text-center py-20"><h1 className="text-2xl font-bold">Inlägget hittades inte eller har blivit borttaget.</h1><Button asChild className="mt-8"><Link href="/forum">Tillbaka till forumet</Link></Button></div>;

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8">
      <Button asChild variant="ghost" className="mb-6 -ml-4 text-slate-400 hover:text-white">
        <Link href="/forum"><ArrowLeft className="w-4 h-4 mr-2" /> Tillbaka till översikten</Link>
      </Button>

      {/* Main Post */}
      <Card className="glass-card border-none rounded-[2rem] overflow-hidden mb-8 shadow-2xl relative">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="p-8 md:p-10 space-y-6 relative z-10">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b border-white/10 pb-6">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <Badge variant="outline" className="text-blue-400 border-blue-500/30 bg-blue-500/10 px-3 py-1 text-sm font-medium">{post.category || 'Allmänt'}</Badge>
                {post.createdAt && (
                  <span className="text-xs text-slate-400 font-medium">
                    {formatDistanceToNow(post.createdAt.toDate(), { addSuffix: true, locale: sv })}
                  </span>
                )}
              </div>
              <h1 className="text-3xl font-headline font-bold text-white leading-tight">{post.title}</h1>
            </div>

            {isAdmin && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"><Trash2 className="w-5 h-5" /></Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="glass-card border-white/10 rounded-3xl">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="w-5 h-5" /> Radera Inlägg</AlertDialogTitle>
                    <AlertDialogDescription>Är du säker? Som admin/moderator tar du nu bort inlägget permanent.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter><AlertDialogCancel>Avbryt</AlertDialogCancel><AlertDialogAction onClick={handleDeletePost} className="bg-destructive hover:bg-destructive/90 text-white">Radera</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>

          <div className="flex items-start gap-4">
            <Avatar className="w-12 h-12 border-2 border-white/10 shrink-0">
              <AvatarImage src={post.authorPhoto} className="object-cover" />
              <AvatarFallback className="bg-primary/20 text-primary font-bold text-lg">{post.authorName?.[0]}</AvatarFallback>
            </Avatar>
            <div className="space-y-4 w-full">
              <p className="font-bold text-slate-300">{post.authorName}</p>
              <div className="text-slate-300 whitespace-pre-wrap leading-relaxed min-h-[100px] text-lg">
                {post.content}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-white/10">
            <Button
              variant={post.likes?.includes(user?.uid) ? "secondary" : "ghost"}
              onClick={handleToggleLikePost}
              disabled={!user}
              className={`rounded-full h-12 px-6 gap-2 transition-all ${post.likes?.includes(user?.uid) ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'text-slate-400 hover:text-white'}`}
            >
              <Heart className={`w-5 h-5 ${post.likes?.includes(user?.uid) ? 'fill-current' : ''}`} />
              <span className="font-bold">{post.likes?.length || 0}</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* Discussion Thread */}
      <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2 ml-2">
        <MessageSquare className="w-5 h-5 text-blue-400" /> 
        Diskussion ({comments.length})
      </h3>

      <div className="space-y-6">
        {comments.map((comment) => (
          <div key={comment.id} className="flex gap-4 group">
            <div className="flex flex-col items-center">
              <Avatar className="w-10 h-10 border border-white/10 shrink-0 mb-2">
                <AvatarImage src={comment.authorPhoto} className="object-cover" />
                <AvatarFallback className="bg-primary/20 text-primary font-bold">{comment.authorName?.[0]}</AvatarFallback>
              </Avatar>
              <div className="w-px h-full bg-white/5 group-last:hidden" />
            </div>
            
            <div className="flex-1 bg-white/5 border border-white/5 rounded-2xl rounded-tl-none p-5 space-y-3 relative group-hover:bg-white/10 transition-colors">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-white">{comment.authorName}</span>
                  <span className="text-[10px] text-slate-500 font-medium">
                    • {comment.createdAt ? formatDistanceToNow(comment.createdAt.toDate(), { addSuffix: true, locale: sv }) : ''}
                  </span>
                </div>
                {isAdmin && (
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteComment(comment.id)} className="opacity-0 group-hover:opacity-100 transition-opacity -mt-2 -mr-2 h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
              
              <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                {comment.content}
              </p>

              <div className="flex justify-end pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleToggleLikeComment(comment)}
                  disabled={!user}
                  className={`rounded-full h-8 px-3 gap-1.5 transition-all ${comment.likes?.includes(user?.uid) ? 'text-red-400 hover:text-red-300 hover:bg-red-500/10' : 'text-slate-500 hover:text-white'}`}
                >
                  <Heart className={`w-3.5 h-3.5 ${comment.likes?.includes(user?.uid) ? 'fill-current' : ''}`} />
                  <span className="text-xs font-bold">{comment.likes?.length || 0}</span>
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Reply Box */}
      {user ? (
        <div className="mt-8 flex gap-4">
          <Avatar className="w-10 h-10 border border-white/10 shrink-0">
            <AvatarImage src={user.photoURL || undefined} className="object-cover" />
            <AvatarFallback className="bg-primary/20 text-primary font-bold">{user.displayName?.[0]}</AvatarFallback>
          </Avatar>
          <div className="flex-1 bg-white/5 border border-white/10 rounded-3xl p-4 pl-6 relative overflow-hidden focus-within:ring-2 ring-blue-500/50 transition-shadow">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
            <div className="flex gap-2 items-center text-blue-400 mb-2">
              <CornerDownRight className="w-4 h-4" />
              <span className="text-xs font-bold tracking-widest uppercase">Skriv ett svar</span>
            </div>
            {isBanned ? (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 text-center space-y-2 mt-4">
                <h3 className="font-bold flex items-center justify-center gap-2"><ShieldAlert className="w-4 h-4" /> Du är spärrad</h3>
                <p className="text-sm">Du har tyvärr förlorat din rättighet att svara i forumet.</p>
              </div>
            ) : (
              <div className="space-y-4 relative z-10">
                <Textarea 
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  placeholder="Skriv ditt inlägg här..."
                  className="min-h-[120px] bg-transparent border-none text-base p-0 focus-visible:ring-0 resize-y placeholder:text-slate-500"
                />
                <div className="flex justify-end pt-2 border-t border-white/10 mt-2">
                  <Button 
                    onClick={handlePostComment}
                    disabled={isSubmitting || newComment.trim().length < 2}
                    className="rounded-full h-10 px-6 font-bold bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/20 text-white"
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                    Skicka
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-12 text-center p-8 bg-white/5 border border-white/10 rounded-[2rem]">
          <h4 className="text-lg font-bold mb-2">Logga in för att delta</h4>
          <p className="text-sm text-slate-400 mb-6">Du måste logga in för att kunna skriva svar eller gilla inlägg.</p>
          <Button asChild className="rounded-full h-12 px-8 font-bold bg-blue-600 hover:bg-blue-500">
            <Link href="/login">Logga In</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
