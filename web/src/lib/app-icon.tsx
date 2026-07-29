import { ImageResponse } from "next/og";

interface RenderAppIconOptions {
  /** iOS の apple-touch-icon は OS 側で自動的に角丸にされるため、二重に丸めない */
  rounded?: boolean;
}

/**
 * アプリの共通アイコン（青→緑のグラデーション + 右肩上がりの折れ線）を
 * 指定サイズの PNG として生成する。icon.tsx / apple-icon.tsx / manifest 用の
 * 追加サイズルートから呼び出す共通描画ロジック。
 */
export function renderAppIcon(size: number, options: RenderAppIconOptions = {}) {
  const rounded = options.rounded ?? true;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #2a78d6 0%, #1baf7a 100%)",
          borderRadius: rounded ? size * 0.22 : 0,
        }}
      >
        <svg
          width={size * 0.6}
          height={size * 0.6}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M3 16 L9 10 L13 14 L21 5"
            stroke="white"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M15 5 L21 5 L21 11" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    { width: size, height: size }
  );
}
