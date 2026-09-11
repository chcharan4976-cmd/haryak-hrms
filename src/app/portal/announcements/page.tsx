'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Pin, Megaphone, Calendar, Users, Info, Loader2 } from 'lucide-react'
import { useAuth } from '@/components/providers/auth-provider'

export default function AnnouncementsPage() {
  const { user } = useAuth()
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAnnouncements() {
      if (!user) return
      try {
        setLoading(true)
        const res = await fetch('/api/announcements')
        if (res.ok) {
          const data = await res.json()
          setAnnouncements(data.announcements || [])
        }
      } catch (error) {
        console.error('Error fetching announcements:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchAnnouncements()
  }, [user])

  const getCategoryIcon = (category: string) => {
    switch (category?.toUpperCase()) {
      case 'HOLIDAY': return Calendar
      case 'EVENT': return Users
      case 'URGENT': return Megaphone
      default: return Info
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category?.toUpperCase()) {
      case 'HOLIDAY': return 'bg-purple-100 text-purple-800'
      case 'EVENT': return 'bg-green-100 text-green-800'
      case 'URGENT': return 'bg-orange-100 text-orange-800'
      case 'POLICY': return 'bg-blue-100 text-blue-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Announcements</h1>
        <p className="text-muted-foreground mt-1">Stay updated with the latest company news and notices.</p>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : announcements.length === 0 ? (
        <div className="p-12 text-center text-sm text-muted-foreground border rounded-xl bg-muted/20 border-dashed">
          No announcements available.
        </div>
      ) : (
        <div className="space-y-4">
          {announcements.map((item) => {
            const Icon = getCategoryIcon(item.category)
            const color = getCategoryColor(item.category)
            
            return (
              <Card key={item.id} className={item.is_pinned ? 'border-blue-200 dark:border-blue-800 shadow-sm' : ''}>
                <CardContent className="p-6">
                  <div className="flex gap-4">
                    <div className="hidden sm:flex shrink-0 h-12 w-12 rounded-full items-center justify-center bg-muted">
                      <Icon className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-2">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${color}`}>
                              {item.category || 'General'}
                            </span>
                            {item.is_pinned && (
                              <span className="flex items-center text-xs text-blue-600 dark:text-blue-400 font-medium">
                                <Pin className="h-3 w-3 mr-1 fill-current" /> Pinned
                              </span>
                            )}
                          </div>
                          <h3 className="text-xl font-semibold leading-none tracking-tight">
                            {item.title}
                          </h3>
                        </div>
                        <div className="text-sm text-muted-foreground sm:text-right shrink-0">
                          <div>{new Date(item.created_at).toLocaleDateString()}</div>
                          <div className="text-xs">by HR Team</div>
                        </div>
                      </div>
                      <div className="text-muted-foreground text-sm mt-2 leading-relaxed whitespace-pre-wrap">
                        {item.content}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
