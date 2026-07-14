import { useEffect, useState } from "react";
import QRCodeLib from "qrcode";

type QRCodeProps = {
  value: string;
  size?: number;
  className?: string;
};

export function QRCode({ value, size = 260, className }: QRCodeProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void QRCodeLib.toDataURL(value, {
      width: size,
      margin: 2,
      color: { dark: "#111111", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div
        className={`flex items-center justify-center bg-white text-muted-foreground ${className ?? ""}`}
        style={{ width: size, height: size }}
      >
        <span className="font-mono text-[9px] uppercase tracking-widest">Loading QR…</span>
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt="Scan to begin the SPX experience"
      width={size}
      height={size}
      className={className}
    />
  );
}
