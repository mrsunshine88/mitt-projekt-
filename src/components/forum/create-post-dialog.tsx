"use client";

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Send } from 'lucide-react';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { collection, addDoc, serverTimestamp, doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { firebaseConfig } from '@/firebase/config';
import { UserProfile } from '@/types/autolog';

const CATEGORIES = [
  "Allmänt",
  "Mekanik & Reparation",
  "Köp & Sälj",
  "CarGuard & Funktioner",
  "Bilvård & Styling"
];

export function CreatePostDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void; }) {
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('Allmänt');
  
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const appId = firebaseConfig.projectId;

  const profileRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'artifacts', appId, 'public', 'data', 'public_profiles', user.uid);
  }, [db, user, appId]);
  const { data: profile } = useDoc<UserProfile>(profileRef);

  const isBanned = profile?.isForumBanned || false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !db) return;
    if (isBanned) {
      toast({ variant: "destructive", title: "Spärrad", description: "Du är spärrad från att skriva i forumet." });
      return;
    }
    
    if (!title.trim() || !content.trim()) {
      toast({ variant: "destructive", title: "Fyll i både rubrik och text" });
      return;
    }

    setLoading(true);
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'forum_posts'), {
        title: title.trim(),
        content: content.trim(),
        category,
        authorId: user.uid,
        authorName: user.displayName || 'Anonym Användare',
        authorPhoto: user.photoURL || null,
        likes: [],
        commentCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      toast({ title: "Inlägg skapat!" });
      setTitle('');
      setContent('');
      onClose();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fel", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="glass-card p-0 rounded-[2rem] sm:max-w-xl border-white/10">
        <div className="p-8">
          <DialogHeader className="mb-6">
            <DialogTitle className="text-2xl font-headline">Nytt inlägg</DialogTitle>
            <DialogDescription>
              Starta en ny diskussionstråd i forumet.
            </DialogDescription>
          </DialogHeader>

          {isBanned ? (
            <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 text-center space-y-2">
              <h3 className="font-bold">Du är spärrad</h3>
              <p className="text-sm">Du har tyvärr förlorat din rättighet att publicera inlägg i forumet.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase opacity-60 ml-1">Kategori</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="h-14 bg-white/5 border-white/10 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase opacity-60 ml-1">Rubrik</Label>
                  <Input 
                    value={title} 
                    onChange={e => setTitle(e.target.value)} 
                    placeholder="T.ex: Hur byter man ABS-givare på en Volvo V70?" 
                    className="h-14 bg-white/5 border-white/10 rounded-xl text-lg font-medium placeholder:text-slate-500"
                    maxLength={100}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase opacity-60 ml-1">Innehåll</Label>
                  <Textarea 
                    value={content} 
                    onChange={e => setContent(e.target.value)} 
                    placeholder="Beskriv din fundering, guide eller diskussionstråd här..." 
                    className="min-h-[200px] resize-y bg-white/5 border-white/10 rounded-xl text-base p-4 placeholder:text-slate-500"
                    required
                  />
                </div>
              </div>

              <DialogFooter className="gap-3 pt-2">
                  <Button 
                    variant="ghost" 
                    type="button" 
                    onClick={onClose} 
                    className="rounded-xl flex-1 h-12"
                  >
                    Avbryt
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={loading || !title.trim() || !content.trim()} 
                    className="rounded-xl flex-[2] h-12 font-bold bg-blue-600 hover:bg-blue-500 shadow-xl shadow-blue-500/20"
                  >
                    {loading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <><Send className="mr-2 w-4 h-4" /> Publicera</>}
                  </Button>
              </DialogFooter>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
