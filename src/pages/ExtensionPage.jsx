import { Link } from 'react-router-dom'
import manifest from '../../chrome-extension/manifest.json'
import { PageHeader } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'

const STEPS = [
  'Download the zip and extract it to a folder you will keep.',
  <>Open <code className="bg-gray-100 px-1 rounded">chrome://extensions</code> (Edge: <code className="bg-gray-100 px-1 rounded">edge://extensions</code>).</>,
  <>Turn on <strong>Developer mode</strong> (top-right toggle).</>,
  <>Click <strong>Load unpacked</strong> and select the extracted folder.</>,
  'Pin the extension to your toolbar.',
]

export function ExtensionPage() {
  return (
    <div className="w-full px-6 py-8">
      <PageHeader
        title="Chrome Extension"
        description={`The InkbornForge extension for Chrome and Edge · version ${manifest.version}`}
        actions={<Button variant="primary" href="/lorcana-extension.zip" download>Download</Button>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card title="Game Scraper" className="p-5">
          <p className="text-sm text-gray-600 leading-relaxed">
            Open any duels.ink spectate link and the extension captures the live game: lore, board,
            hand counts and the action log. It shows up on the{' '}
            <Link to="/game-scraper" className="underline">Game Scraper</Link> and can be saved to your
            Scouting Library. Nothing to do per game.
          </p>
        </Card>
        <Card title="inkDecks pull" className="p-5">
          <p className="text-sm text-gray-600 leading-relaxed">
            On any inkDecks.com page, click the extension to export it as JSON: a tournament's full deck
            list (every page, deduped and checked for gaps), matchup matrices, metagame shares, the
            tournament index or the card database. Download it or copy it to the clipboard.
          </p>
        </Card>
      </div>

      <Card title="Install" className="p-5">
        <ol className="list-decimal ml-5 space-y-1.5 text-sm text-gray-700">
          {STEPS.map((step, i) => <li key={i}>{step}</li>)}
        </ol>
        <p className="text-sm text-gray-500 mt-4">
          To update, download the new zip, replace the folder's contents and click the reload icon on the
          extension's card in <code className="bg-gray-100 px-1 rounded">chrome://extensions</code>.
        </p>
      </Card>
    </div>
  )
}
