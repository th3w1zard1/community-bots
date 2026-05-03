import { Button } from '@/components/ui/button'
import { Moon, Sun } from '@phosphor-icons/react'
import { useKV } from '@github/spark/hooks'
import { useEffect } from 'react'

export type HolocronSessionUi =
  | { status: 'loading' }
  | { status: 'anonymous'; oauthAvailable: boolean }
  | { status: 'loggedIn'; discord: { username: string; displayName: string } }

type TopNavProps = {
  holocronSession?: HolocronSessionUi
  onHolocronLogout?: () => void | Promise<void>
}

export function TopNav({ holocronSession, onHolocronLogout }: TopNavProps) {
  const [theme, setTheme] = useKV<'light' | 'dark'>('theme', 'dark')

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])

  const toggleTheme = () => {
    setTheme((current) => current === 'dark' ? 'light' : 'dark')
  }

  return (
    <nav className="w-full bg-card/80 backdrop-blur-sm border-b border-border fixed top-0 left-0 right-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <a 
              href="https://openkotor.com/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-foreground hover:text-accent transition-colors"
            >
              <div className="w-6 h-6 rounded-full bg-foreground" />
              <span className="font-bold text-sm uppercase tracking-wider">OpenKotOR</span>
            </a>
            
            <div className="hidden md:flex items-center gap-4 text-sm">
              <a 
                href="https://openkotor.com/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Home
              </a>
              <a 
                href="https://openkotor.com/#projects" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Projects
              </a>
              <a 
                href="https://openkotor.com/#faq" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                FAQ
              </a>
              <a 
                href="https://openkotor.com/#formats" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Formats
              </a>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {holocronSession?.status === 'loggedIn' ? (
              <>
                <span className="hidden sm:inline text-xs text-muted-foreground max-w-[140px] truncate" title={holocronSession.discord.displayName}>
                  {holocronSession.discord.displayName}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => void onHolocronLogout?.()}
                >
                  Sign out
                </Button>
              </>
            ) : null}
            {holocronSession?.status === 'anonymous' && holocronSession.oauthAvailable ? (
              <a href="/api/trask/auth/discord/start">
                <Button size="sm" className="bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-semibold">
                  Sign in with Discord
                </Button>
              </a>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="text-foreground hover:text-accent hover:bg-primary/10 transition-all"
              aria-label="Toggle theme"
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? (
                <Sun size={18} weight="bold" />
              ) : (
                <Moon size={18} weight="bold" />
              )}
            </Button>
            
            <a 
              href="https://discord.gg/openkotor" 
              target="_blank" 
              rel="noopener noreferrer"
            >
              <Button
                size="sm"
                className="bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-semibold hidden sm:flex"
              >
                Join the Discord →
              </Button>
            </a>
          </div>
        </div>
      </div>
    </nav>
  )
}
