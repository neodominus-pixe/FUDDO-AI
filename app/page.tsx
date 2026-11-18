import { Instrument_Serif } from 'next/font/google'
import Landing from '@/components/landing/Landing'
import './landing.css'

// The one serif on the site, used only for the italic emphasis in headlines.
const serif = Instrument_Serif({
  weight: '400',
  style: ['normal', 'italic'],
  subsets: ['latin'],
  variable: '--font-serif',
})

export default function Home() {
  return <Landing fontClass={serif.variable} />
}
