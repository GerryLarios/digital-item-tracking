import { updateSteamSettingsAction } from "@/app/actions/settings";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SteamSettingsForm({
  steamId,
  hasWishlistUrl,
}: {
  steamId: string;
  hasWishlistUrl: boolean;
}) {
  return (
    <form action={updateSteamSettingsAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="steamId">SteamID64</Label>
        <Input
          id="steamId"
          name="steamId"
          defaultValue={steamId}
          placeholder="7656119…"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="wishlistShareUrl">Wishlist share URL</Label>
        <Input
          id="wishlistShareUrl"
          name="wishlistShareUrl"
          type="password"
          autoComplete="off"
          placeholder={
            hasWishlistUrl
              ? "Configured — paste a new link to replace it"
              : "https://store.steampowered.com/wishlist/…"
          }
        />
        <p className="text-xs text-muted-foreground">
          Optional fallback for a private wishlist. The link is encrypted and
          never displayed after saving.
        </p>
      </div>
      <button className={buttonVariants()} type="submit">
        Save Steam settings
      </button>
    </form>
  );
}
