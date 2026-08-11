import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eraser } from "lucide-react";

interface Props {
  onChange: (dataUrl: string | null) => void;
  height?: number;
}

export function SignaturePad({ onChange, height = 180 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
  }, [height]);

  function pos(e: React.PointerEvent) {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function down(e: React.PointerEvent) {
    drawing.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const { x, y } = pos(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const { x, y } = pos(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.lineTo(x, y);
    ctx.stroke();
    if (empty) setEmpty(false);
  }
  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    const data = canvasRef.current!.toDataURL("image/png");
    onChange(empty ? null : data);
  }

  function clear() {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
    onChange(null);
  }

  return (
    <div className="space-y-2">
      <div
        className="rounded-lg border bg-white touch-none"
        style={{ height }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerLeave={up}
          className="w-full h-full block cursor-crosshair"
        />
      </div>
      <div className="flex justify-between items-center text-xs text-muted-foreground">
        <span>وقّع بإصبعك أو الفأرة داخل المربع أعلاه</span>
        <Button type="button" size="sm" variant="ghost" onClick={clear}>
          <Eraser className="size-3.5" /> مسح
        </Button>
      </div>
    </div>
  );
}
