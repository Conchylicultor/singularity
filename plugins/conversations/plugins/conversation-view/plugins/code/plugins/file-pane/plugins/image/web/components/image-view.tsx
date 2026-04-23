export function ImageView({
  conversationId,
  path,
}: {
  conversationId: string;
  path: string;
}) {
  const src = `/api/conversations/${conversationId}/image?path=${encodeURIComponent(path)}`;
  return (
    <div className="flex h-full items-center justify-center overflow-auto p-4">
      <img
        src={src}
        alt={path.slice(path.lastIndexOf("/") + 1)}
        className="max-h-full max-w-full object-contain"
        style={{ imageRendering: "pixelated" }}
        onLoad={(e) => {
          // restore crisp rendering only for small images
          const img = e.currentTarget;
          if (img.naturalWidth > 64 || img.naturalHeight > 64) {
            img.style.imageRendering = "auto";
          }
        }}
      />
    </div>
  );
}
