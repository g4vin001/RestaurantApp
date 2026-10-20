"use client";

import { ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import { useEffect, useState, type ChangeEvent } from "react";
import { removeRestaurantCoverImage, uploadRestaurantCoverImage } from "@/app/manager/settings/actions";
import { useDemo } from "@/components/demo/DemoProvider";
import { COVER_IMAGE_MAX_BYTES } from "@/lib/customer/cover-image";

const MAX_WIDTH = 1600;

// Re-encodes the photo as a JPEG no wider than MAX_WIDTH so phone camera
// files (often 5–12 MB) upload quickly and stay small in the database.
async function resizeForUpload(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  if (!blob) throw new Error("The photo could not be encoded.");
  return blob;
}

export function RestaurantPhotoField() {
  const { mode, state } = useDemo();
  const [imageUrl, setImageUrl] = useState(state.restaurant.coverImageUrl ?? null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  const demo = mode === "demo";

  // Follow changes saved from another device once this one is idle.
  useEffect(() => {
    if (!busy) setImageUrl(state.restaurant.coverImageUrl ?? null);
  }, [state.restaurant.coverImageUrl, busy]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    // Keep the photo picker from marking the settings form as edited.
    event.stopPropagation();
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy("upload");
    setMessage(null);
    try {
      const resized = await resizeForUpload(file);
      if (resized.size > COVER_IMAGE_MAX_BYTES) {
        setMessage({ text: "That photo is too large even after resizing. Try a different image.", failed: true });
        return;
      }
      const formData = new FormData();
      formData.set("image", resized, "cover.jpg");
      const result = await uploadRestaurantCoverImage(formData);
      if (result.ok) setImageUrl(result.coverImageUrl);
      setMessage(result.ok ? { text: "Photo saved. Customers now see it on your restaurant page.", failed: false } : { text: result.error, failed: true });
    } catch {
      setMessage({ text: "That file could not be read as an image. Try a JPEG, PNG, or WebP photo.", failed: true });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("remove");
    setMessage(null);
    try {
      const result = await removeRestaurantCoverImage();
      if (result.ok) setImageUrl(null);
      setMessage(result.ok ? { text: "Photo removed.", failed: false } : { text: result.error, failed: true });
    } catch {
      setMessage({ text: "The photo could not be removed. Please try again.", failed: true });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-5">
      <p className="text-sm font-medium text-stone-700">Restaurant photo</p>
      <p className="mt-1 text-xs leading-5 text-stone-500">
        Shown at the top of your public restaurant page behind your name, location, and open status. A wide photo of your dining room or storefront works best.
      </p>
      <div className="relative mt-3 aspect-[16/6] overflow-hidden rounded-xl border border-stone-200 bg-stone-900">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- versioned route already serves a resized JPEG
          <img src={imageUrl} alt="Current restaurant photo" className="h-full w-full object-cover opacity-70" />
        ) : (
          <div className="grid h-full place-items-center bg-gradient-to-br from-emerald-900 to-stone-900 text-sm text-emerald-100/80">
            No photo yet
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 grid place-items-center bg-stone-950/50 text-white" role="status">
            <span className="inline-flex items-center gap-2 text-sm font-semibold">
              <LoaderCircle size={18} className="animate-spin" />
              {busy === "upload" ? "Uploading photo…" : "Removing photo…"}
            </span>
          </div>
        )}
      </div>
      {demo ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          Photo uploads are saved to the shared database, so they are unavailable in demo mode.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={upload}
            className="peer sr-only"
            id="restaurant-photo"
            disabled={busy !== null}
          />
          <label
            htmlFor="restaurant-photo"
            className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-stone-300 px-4 text-sm font-semibold text-stone-700 hover:bg-stone-50 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-600 ${busy ? "pointer-events-none opacity-60" : ""}`}
          >
            <ImagePlus size={17} />
            {imageUrl ? "Replace photo" : "Upload photo"}
          </label>
          {imageUrl && (
            <button
              type="button"
              onClick={remove}
              disabled={busy !== null}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
            >
              <Trash2 size={17} />
              Remove
            </button>
          )}
        </div>
      )}
      {message && (
        <p className={`mt-2 text-sm font-medium ${message.failed ? "text-rose-700" : "text-emerald-700"}`} role={message.failed ? "alert" : "status"}>
          {message.text}
        </p>
      )}
    </div>
  );
}
