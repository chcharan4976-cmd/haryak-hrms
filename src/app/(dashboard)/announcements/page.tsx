'use client'

import { useState, useEffect } from 'react'
import { Megaphone, Plus, Pin, Calendar, PlusCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'

interface Announcement {
  id: string
  title: string
  content: string
  category: string
  author: { name: string } | string
  created_at: string
  is_pinned: boolean
}

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState('General')
  const [pinned, setPinned] = useState(false)
  const [saving, setSaving] = useState(false)

  const fetchAnnouncements = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/announcements')
      const data = await res.json()
      if (data.success) {
        setAnnouncements(data.announcements)
      }
    } catch (err) {
      console.error('Error fetching announcements', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAnnouncements()
  }, [])

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) {
      toast.error('Title and message content are required.')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          category,
          is_pinned: pinned
        })
      })
      const data = await res.json()
      if (data.success) {
        setAnnouncements([data.announcement, ...announcements])
        toast.success('Announcement published successfully across the organization!')
        setIsDialogOpen(false)
        setTitle('')
        setContent('')
        setPinned(false)
      } else {
        toast.error(data.error || 'Failed to publish announcement')
      }
    } catch (err) {
      toast.error('Error publishing announcement')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <PageHeader
        title="Company Announcements"
        description="Broadcast official circulars, event updates, and HR policies across the organization."
      >
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#1e2a78] hover:bg-[#152060] text-white text-xs font-semibold shadow-sm">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Create Announcement
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-bold">Publish Company Announcement</DialogTitle>
              <DialogDescription className="text-xs">
                This notice will be visible on the Employee Portal and executive dashboards.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateAnnouncement} className="space-y-3.5 py-2 text-xs">
              <div className="space-y-1">
                <Label htmlFor="title">Subject / Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g. Q3 Townhall Meeting & Holiday Notice"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="cat">Category</Label>
                <select
                  id="cat"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full p-2 border rounded-md text-xs bg-background"
                >
                  <option value="General">General Corporate</option>
                  <option value="HR Policy">HR Policy</option>
                  <option value="Event">Holiday & Event</option>
                  <option value="Executive">Executive Leadership</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="msg">Message Body *</Label>
                <Textarea
                  id="msg"
                  placeholder="Write announcement details..."
                  rows={4}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="pin"
                  checked={pinned}
                  onChange={(e) => setPinned(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="pin" className="cursor-pointer text-xs">Pin to top of portal feed</Label>
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="bg-[#1e2a78] hover:bg-[#152060] text-white" disabled={saving}>
                  {saving ? 'Publishing...' : 'Publish Notice'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-card rounded-xl border">
          <Loader2 className="w-8 h-8 animate-spin text-[#1e2a78] mb-2" />
          <p className="text-xs text-muted-foreground">Loading announcements...</p>
        </div>
      ) : announcements.length === 0 ? (
        <Card>
          <CardContent className="p-8">
            <EmptyState
              icon={Megaphone}
              title="No announcements have been published."
              description="Keep your team updated by broadcasting company news, holiday schedules, and corporate circulars."
              action={
                <Button
                  size="sm"
                  className="bg-[#1e2a78] hover:bg-[#152060] text-white text-xs font-semibold"
                  onClick={() => setIsDialogOpen(true)}
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" /> Publish First Announcement
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {announcements.map((ann) => (
            <Card key={ann.id} className={ann.is_pinned ? "border-blue-300 ring-1 ring-blue-100 shadow-sm" : "shadow-xs"}>
              <CardContent className="p-6 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {ann.is_pinned && <Pin className="w-4 h-4 text-blue-600 fill-current" />}
                    <h3 className="font-bold text-base text-foreground">{ann.title}</h3>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{ann.category}</Badge>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{ann.content}</p>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-3 border-t">
                  <span>Author: {typeof ann.author === 'object' ? ann.author?.name || 'Admin' : ann.author || 'Admin'}</span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> {new Date(ann.created_at).toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
