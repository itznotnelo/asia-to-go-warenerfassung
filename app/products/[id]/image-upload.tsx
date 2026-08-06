"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { ImageType } from "@/lib/generated/prisma/client";
import { uploadProductImage } from "../actions";

const TYPE_LABELS: Record<ImageType, string> = {
  front: "Vorderseite",
  ingredients: "Zutaten",
  nutrition: "Nährwerte",
  other: "Weitere",
};

const TYPES: ImageType[] = ["front", "ingredients", "nutrition", "other"];

/** Eigenes Foto hochladen — der einzige Weg, wie ein OFF-Miss-Artikel je ein Bild bekommt (`capture="environment"` öffnet auf Handy/Tablet direkt die Kamera). */
export function ImageUpload({ productId }: { productId: string }) {
  const router = useRouter();
  const [uploadingType, setUploadingType] = useState<ImageType | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const inputRefs = useRef<Partial<Record<ImageType, HTMLInputElement | null>>>({});

  async function handleFileChange(type: ImageType, event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploadingType(type);
    setMessage(null);

    const formData = new FormData();
    formData.set("productId", productId);
    formData.set("type", type);
    formData.set("file", file);

    const result = await uploadProductImage(formData);
    setUploadingType(null);

    if (result.ok) {
      router.refresh();
    } else {
      setMessage(result.message);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {TYPES.map((type) => (
          <div key={type}>
            <input
              ref={(el) => {
                inputRefs.current[type] = el;
              }}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => handleFileChange(type, event)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploadingType !== null}
              onClick={() => inputRefs.current[type]?.click()}
            >
              {uploadingType === type ? "Lädt hoch …" : `+ ${TYPE_LABELS[type]}`}
            </Button>
          </div>
        ))}
      </div>
      {message && <p className="text-sm text-destructive">{message}</p>}
    </div>
  );
}
