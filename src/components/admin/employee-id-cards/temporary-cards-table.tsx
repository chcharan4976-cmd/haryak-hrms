'use client'

import React, { useState, useEffect } from 'react'
import { Clock, Trash2, ShieldAlert, FileText, Image as ImageIcon, CheckCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { safeParseResponse } from '@/lib/api-client'

export interface TemporaryCardItem {
  id: string
  employee_id?: string
  employee_code: string
  design_type: string
  employee_name: string
  designation?: string
  department?: string
  phone?: string
  email?: string
  location?: string
  photo_url?: string | null
  card_image_path?: string | null
  card_pdf_path?: string | null
  created_at: string
  expires_at: string
}

interface TemporaryCardsTableProps {
  cards: TemporaryCardItem[]
  loading: boolean
  onRefresh: () => void
  onDeleteSuccess?: () => void
  schemaError?: string | null
}

function formatCountdown(expiresAt: string): { text: string; isExpiringSoon: boolean; isExpired: boolean } {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) {
    return { text: 'Expired (purging...)', isExpiringSoon: true, isExpired: true }
  }

  const hours = Math.floor(diff / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((diff % (1000 * 60)) / 1000)

  const isExpiringSoon = hours < 3
  return {
    text: `${hours}h ${minutes}m ${seconds}s remaining`,
    isExpiringSoon,
    isExpired: false,
  }
}

export function TemporaryCardsTable({
  cards,
  loading,
  onRefresh,
  onDeleteSuccess,
  schemaError,
}: TemporaryCardsTableProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [, setTick] = useState(0)

  // Live countdown ticker every second
  useEffect(() => {
    const timer = setInterval(() => {
      setTick(t => t + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const handleDelete = async (cardId: string) => {
    if (!confirm('Are you sure you want to permanently delete this temporary ID card now?')) {
      return
    }

    setDeletingId(cardId)
    try {
      const res = await fetch(`/api/admin/employee-id-cards/${cardId}`, {
        method: 'DELETE',
      })
      const parseResult = await safeParseResponse<{ success: boolean; error?: string }>(res)
      if (parseResult.ok && parseResult.data?.success) {
        toast.success('Temporary ID card and storage files deleted permanently.')
        onRefresh()
        onDeleteSuccess?.()
      } else {
        const errorMsg = parseResult.data?.error || parseResult.error || 'Failed to delete ID card.'
        toast.error(errorMsg)
      }
    } catch (err: any) {
      toast.error(err.message || 'Error deleting card.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden space-y-4 p-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-border">
        <div>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-600" />
            Active Temporary ID Cards (24-Hour Retention Window)
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Generated cards are automatically and permanently deleted 24 hours after creation.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={loading}
          className="text-xs h-8"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Security Expiration Policy Notice Banner */}
      <div className="bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-lg p-3 text-xs text-blue-900 dark:text-blue-200 flex items-start gap-2.5">
        <ShieldAlert className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold">Automated 24-Hour Data Retention Protocol:</span> Every generated ID card,
          exported 4K PNG, and 300 DPI print-ready PDF exists temporarily for strictly 24 hours. Once expired, the
          record and all associated storage files are wiped. Permanent employee records and profile photos remain untouched.
        </div>
      </div>

      {schemaError ? (
        <div className="py-10 px-6 text-center space-y-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
          <ShieldAlert className="w-10 h-10 text-amber-600 dark:text-amber-400 mx-auto" />
          <div className="text-sm font-bold text-foreground">Database Setup Incomplete (HTTP 503)</div>
          <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
            {schemaError}
          </p>
          <div className="text-[11px] font-mono text-amber-800 dark:text-amber-300 bg-amber-500/15 py-1.5 px-3 rounded inline-block">
            Required migrations: 20261102_temporary_employee_id_cards.sql &bull; 20261104_atomic_employee_code_allocation.sql
          </div>
        </div>
      ) : loading && cards.length === 0 ? (
        <div className="py-12 text-center text-xs text-muted-foreground">
          Loading active temporary cards...
        </div>
      ) : cards.length === 0 ? (
        <div className="py-12 text-center space-y-2">
          <CheckCircle className="w-10 h-10 text-muted-foreground/40 mx-auto" />
          <div className="text-sm font-semibold text-foreground">No Active Temporary ID Cards</div>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Generate a card using the studio above. Newly generated cards will appear here with live 24-hour expiration countdowns.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-muted-foreground font-semibold uppercase text-[10px] tracking-wider">
                <th className="py-2.5 px-3">Employee</th>
                <th className="py-2.5 px-3">Design</th>
                <th className="py-2.5 px-3">Created</th>
                <th className="py-2.5 px-3">Expiration Countdown</th>
                <th className="py-2.5 px-3 text-center">Downloads</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cards.map(card => {
                const countdown = formatCountdown(card.expires_at)
                const isElite = card.design_type === 'CORPORATE_ELITE'

                return (
                  <tr key={card.id} className="hover:bg-muted/20 transition-colors">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-10 rounded bg-slate-900 border border-border overflow-hidden flex-shrink-0">
                          {card.photo_url ? (
                            <img src={card.photo_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-white bg-blue-900">
                              {card.employee_name.charAt(0)}
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-foreground">{card.employee_name}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Badge variant="outline" className="font-mono text-[9px] px-1.5 py-0 h-4">
                              {card.employee_code}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground truncate max-w-[130px]">
                              {card.designation || 'Staff'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <Badge
                        variant="secondary"
                        className={`text-[10px] font-medium ${
                          isElite
                            ? 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200 border-blue-200'
                            : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {isElite ? 'Design 01 (Royal Corporate)' : 'Design 02 (Modern Azure)'}
                      </Badge>
                    </td>

                    <td className="py-3 px-3 font-mono text-[11px] text-muted-foreground">
                      {new Date(card.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>

                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        <Clock className={`w-3.5 h-3.5 ${countdown.isExpiringSoon ? 'text-rose-500' : 'text-emerald-500'}`} />
                        <span
                          className={`font-mono text-xs font-semibold ${
                            countdown.isExpiringSoon ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {countdown.text}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <div className="flex items-center justify-center gap-1.5">
                        {card.card_image_path ? (
                          <a
                            href={`/api/admin/employee-id-cards/download?path=${encodeURIComponent(card.card_image_path)}`}
                            download
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-muted hover:bg-muted/80 text-[10px] font-semibold text-foreground border border-border transition-colors"
                            title="Download 4K Ultra-HD PNG"
                          >
                            <ImageIcon className="w-3 h-3 text-blue-600" />
                            PNG
                          </a>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}

                        {card.card_pdf_path ? (
                          <a
                            href={`/api/admin/employee-id-cards/download?path=${encodeURIComponent(card.card_pdf_path)}`}
                            download
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-muted hover:bg-muted/80 text-[10px] font-semibold text-foreground border border-border transition-colors"
                            title="Download 300 DPI CR80 Print PDF"
                          >
                            <FileText className="w-3 h-3 text-red-600" />
                            PDF
                          </a>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-3 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(card.id)}
                        disabled={deletingId === card.id}
                        className="h-7 w-7 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                        title="Delete Now (Purge immediately)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
