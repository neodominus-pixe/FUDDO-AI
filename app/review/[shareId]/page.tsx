import ReviewClient from '@/components/ReviewClient'

export default async function ReviewPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params
  return <ReviewClient shareId={shareId} />
}
