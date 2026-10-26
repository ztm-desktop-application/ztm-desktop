import { isTauri } from "@tauri-apps/api/core";
import { AppAlertDialog } from "@/components/app-alert-dialog";
import { Button } from "@/components/ui/button";
import {
  useWebViewManager,
  type WebViewRequest,
} from "@/hooks/use-web-view-manager";

type WebViewProps = {
  active: boolean;
  /** The latest page asked for, e.g. a course opened from the Dashboard. */
  request: WebViewRequest | null;
  sidebarTooltipOpen?: boolean;
  authCheck?: boolean;
};

// The site sends X-Frame-Options: DENY, so an iframe stays blank. Rust lays a
// native child webview over this placeholder div instead (see web_view.rs).
export function WebView({
  active,
  request,
  sidebarTooltipOpen = false,
  authCheck = false,
}: WebViewProps) {
  const desktop = isTauri();
  const {
    containerRef,
    openFailed,
    errorDialogOpen,
    setErrorDialogOpen,
    retry,
  } = useWebViewManager({ active, request, sidebarTooltipOpen, authCheck });

  return (
    <div
      ref={containerRef}
      data-testid="web-view-slot"
      className="h-[calc(100svh-3.5rem)] w-full"
    >
      {(openFailed || !desktop) && (
        <Button
          variant="outline"
          className="m-4"
          onClick={() => setErrorDialogOpen(true)}
        >
          Web View unavailable
        </Button>
      )}
      <AppAlertDialog
        open={active && errorDialogOpen}
        onOpenChange={setErrorDialogOpen}
        title={
          desktop
            ? "Could not open the Web View"
            : "Web View requires the desktop app"
        }
        description={
          desktop ? (
            "The Web View could not be opened. Please try again."
          ) : (
            <>
              Web View is only available in the ZTM desktop app. Open the
              desktop app to continue.
              {import.meta.env.DEV && (
                <>
                  {" "}
                  For development, run npm run tauri dev and use the desktop
                  window, not the browser preview.
                </>
              )}
            </>
          )
        }
        action={desktop ? { label: "Try again", onClick: retry } : undefined}
      />
    </div>
  );
}
