import Image from "next/image";
import type { ImageType } from "@/lib/generated/prisma/client";

const TYPE_LABELS: Record<ImageType, string> = {
  front: "Vorderseite",
  ingredients: "Zutaten",
  nutrition: "Nährwerte",
  other: "Weitere",
};

interface ProductImageRow {
  id: string;
  type: ImageType;
  path: string;
  width: number;
  height: number;
  sourceAttribution: string | null;
}

export function ProductImages({ images }: { images: ProductImageRow[] }) {
  if (images.length === 0) {
    return <p className="text-sm text-muted-foreground">Noch keine Bilder — manueller Upload ist noch nicht angebunden.</p>;
  }

  return (
    <div className="flex flex-wrap gap-4">
      {images.map((image) => (
        <figure key={image.id} className="flex flex-col items-center gap-1.5">
          <Image
            src={`/api/images/${image.path}`}
            alt={TYPE_LABELS[image.type]}
            width={image.width}
            height={image.height}
            className="h-32 w-32 rounded-lg border border-border object-cover"
          />
          <figcaption className="text-xs text-muted-foreground">{TYPE_LABELS[image.type]}</figcaption>
        </figure>
      ))}
    </div>
  );
}
