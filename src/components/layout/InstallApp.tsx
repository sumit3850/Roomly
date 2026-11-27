import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Bookmark, Copy, Download, Share, Smartphone } from 'lucide-react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { appUrl, canPromptInstall, isAndroid, isIos, isStandalone, onInstallChange, promptInstall } from '@/lib/pwa'

function useInstallState() {
  const [, force] = useState(0)
  useEffect(() => onInstallChange(() => force((n) => n + 1)), [])
  return { canPrompt: canPromptInstall(), installed: isStandalone() }
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-2 text-sm">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span>
          <span className="pt-0.5">{it}</span>
        </li>
      ))}
    </ol>
  )
}

export function InstallDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const url = appUrl()
  async function copy() {
    try { await navigator.clipboard.writeText(url); toast.success('App link copied') } catch { toast.info(url) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5" /> Install Roomly</DialogTitle>
          <DialogDescription>Add Roomly to your home screen. It opens full-screen like an app, with its own icon. Free, no app store needed.</DialogDescription>
        </DialogHeader>
        {isIos() ? (
          <Steps items={[
            <>Open this page in <b>Safari</b>.</>,
            <>Tap the <b>Share</b> button <Share className="inline h-4 w-4" /> at the bottom of the screen.</>,
            <>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</>,
          ]} />
        ) : isAndroid() ? (
          <Steps items={[
            <>Open this page in <b>Chrome</b>.</>,
            <>Tap the <b>⋮</b> menu at the top-right.</>,
            <>Tap <b>Install app</b> or <b>Add to Home screen</b>, then <b>Install</b>.</>,
          ]} />
        ) : (
          <Steps items={[
            <>In Chrome or Edge, click the <b>install icon</b> <Download className="inline h-4 w-4" /> at the right end of the address bar, then <b>Install</b>.</>,
            <>Or bookmark it: press <b>Ctrl + D</b> (<b>⌘ + D</b> on Mac) <Bookmark className="inline h-4 w-4" />.</>,
          ]} />
        )}
        <div className="rounded-lg border bg-muted/50 p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">App link</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate text-sm">{url}</code>
            <Button size="sm" variant="outline" onClick={() => void copy()}><Copy /> Copy</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** "Install app" button: native install prompt where supported, otherwise step-by-step help. */
export function InstallAppButton({ label = 'Install app', ...props }: ButtonProps & { label?: string }) {
  const { canPrompt, installed } = useInstallState()
  const [open, setOpen] = useState(false)
  if (installed) return null
  return (
    <>
      <Button
        {...props}
        onClick={async () => {
          if (canPrompt) {
            const ok = await promptInstall()
            if (ok) toast.success('Roomly installed — find it on your home screen')
          } else {
            setOpen(true)
          }
        }}
      >
        <Download /> {label}
      </Button>
      <InstallDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
