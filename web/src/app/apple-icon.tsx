import { renderAppIcon } from "@/lib/app-icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  // iOS が自動で角丸にするため rounded: false（二重丸め防止）
  return renderAppIcon(180, { rounded: false });
}
