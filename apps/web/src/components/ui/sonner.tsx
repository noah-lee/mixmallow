import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { usePhone } from "@/lib/use-media-query"
import { useTheme } from "@/providers/theme-provider"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme()
  const phone = usePhone()

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      position={phone ? "bottom-center" : "bottom-right"}
      // A page with a bar fixed to the bottom raises toasts above it by setting this var.
      mobileOffset={{ bottom: "var(--toast-offset-bottom, 16px)" }}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4 text-destructive" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
          actionButton: "h-11! rounded-full! px-4! text-sm! font-bold!",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
