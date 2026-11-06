'use client'

import React, { useState, useRef, useEffect, ChangeEvent } from 'react'
import { Upload, ZoomIn, ZoomOut, RotateCcw, Image as ImageIcon, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface EmployeePhotoCropperProps {
  currentPhotoUrl?: string | null
  onPhotoProcessed: (dataUrl: string) => void
  employeeName?: string
  cropShape?: 'circle' | 'rect'
}

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const MAX_SIZE_MB = 5

export function EmployeePhotoCropper({
  currentPhotoUrl,
  onPhotoProcessed,
  employeeName = 'Employee',
  cropShape = 'circle',
}: EmployeePhotoCropperProps) {
  const [selectedFileUrl, setSelectedFileUrl] = useState<string | null>(currentPhotoUrl || null)
  const [zoom, setZoom] = useState<number>(1)
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  // Sync when employee selection changes currentPhotoUrl
  useEffect(() => {
    if (currentPhotoUrl) {
      setSelectedFileUrl(currentPhotoUrl)
      setZoom(1)
      setOffset({ x: 0, y: 0 })
    }
  }, [currentPhotoUrl])

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Invalid file type. Please upload a high-quality JPG or PNG image.')
      return
    }

    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(`Image exceeds ${MAX_SIZE_MB}MB size limit. Please upload an optimized photo.`)
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string
      setSelectedFileUrl(dataUrl)
      setZoom(1)
      setOffset({ x: 0, y: 0 })
      onPhotoProcessed(dataUrl)
      toast.success('Photo loaded. You can zoom and adjust position.')
    }
    reader.readAsDataURL(file)
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleReset = () => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }

  // Export cropped canvas matching selected shape (circle or portrait rectangle)
  const handleApplyCrop = () => {
    if (!selectedFileUrl) return

    const canvas = document.createElement('canvas')
    const size = 600
    canvas.width = size
    canvas.height = cropShape === 'circle' ? size : Math.round(size * 1.25)
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Calculate position based on zoom and offset
      const scale = Math.max(canvas.width / img.width, canvas.height / img.height) * zoom
      const drawWidth = img.width * scale
      const drawHeight = img.height * scale
      const drawX = (canvas.width - drawWidth) / 2 + offset.x * (canvas.width / 150)
      const drawY = (canvas.height - drawHeight) / 2 + offset.y * (canvas.height / 150)

      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight)

      const croppedDataUrl = canvas.toDataURL('image/png', 0.95)
      onPhotoProcessed(croppedDataUrl)
      toast.success('Photograph adjusted and applied to preview.')
    }
    img.src = selectedFileUrl
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-blue-600" />
          Employee Photograph
        </h3>
        <span className="text-[11px] text-muted-foreground font-medium">
          JPG, PNG • Max {MAX_SIZE_MB}MB
        </span>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4">
        {/* Interactive Viewport / Cropping Area */}
        <div
          className={`relative w-36 h-36 overflow-hidden bg-slate-900 border-2 border-dashed border-blue-500/50 flex items-center justify-center cursor-move select-none shadow-inner ${
            cropShape === 'circle' ? 'rounded-full' : 'rounded-2xl h-44'
          }`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {selectedFileUrl ? (
            <img
              ref={imageRef}
              src={selectedFileUrl}
              alt={employeeName}
              style={{
                transform: `scale(${zoom}) translate(${offset.x}px, ${offset.y}px)`,
                transition: isDragging ? 'none' : 'transform 0.1s ease',
              }}
              className="w-full h-full object-cover pointer-events-none"
            />
          ) : (
            <div className="text-center p-2 text-slate-400">
              <Upload className="w-8 h-8 mx-auto mb-1 opacity-60" />
              <span className="text-[10px] block">Click Upload</span>
            </div>
          )}

          {/* Positioning Guide Ring */}
          <div
            className={`absolute inset-0 pointer-events-none border-2 border-white/30 ${
              cropShape === 'circle' ? 'rounded-full' : 'rounded-2xl'
            }`}
          />
        </div>

        {/* Controls Column */}
        <div className="flex-1 space-y-3 w-full">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs"
            >
              <Upload className="w-3.5 h-3.5 mr-1.5" />
              Upload Custom Photo
            </Button>

            {currentPhotoUrl && selectedFileUrl !== currentPhotoUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedFileUrl(currentPhotoUrl)
                  onPhotoProcessed(currentPhotoUrl)
                  handleReset()
                }}
                className="text-xs"
              >
                Use DB Profile Photo
              </Button>
            )}
          </div>

          {selectedFileUrl && (
            <div className="space-y-2 pt-1 border-t border-border/50">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground font-medium">Zoom:</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setZoom(z => Math.max(0.8, z - 0.1))}
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </Button>
                <span className="text-xs font-mono w-10 text-center">{Math.round(zoom * 100)}%</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setZoom(z => Math.min(2.5, z + 0.1))}
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 ml-auto"
                  onClick={handleReset}
                  title="Reset Position"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </Button>
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="text-xs h-7"
                  onClick={handleApplyCrop}
                >
                  <Check className="w-3.5 h-3.5 mr-1" />
                  Apply Adjustment
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
