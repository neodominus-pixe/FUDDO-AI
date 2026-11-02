// A plating is either a locally drawn SVG (mock provider) or a real generated
// picture (paid provider). Every surface that shows a plating goes through here
// so switching providers does not need a change in five separate components.
export default function PlatingImage({
  svg,
  imageUrl,
  className = '',
  alt = '',
}: {
  svg?: string | null
  imageUrl?: string | null
  className?: string
  alt?: string
}) {
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt={alt} className={`${className} object-cover`} />
  }
  return <div className={`plating-svg ${className}`} dangerouslySetInnerHTML={{ __html: svg ?? '' }} />
}
