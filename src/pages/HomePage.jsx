import { Link } from 'react-router-dom'
import { isSupporterPath } from '../lib/access'
import { SECTIONS } from '../lib/siteSections'
import { ToolIcon } from '../components/ToolIcon'
import { Badge } from '../components/ui/Badge'

const SUBSTACK_URL = 'https://inkbornforge.substack.com'

const CARD = 'group flex flex-col gap-3 bg-white border border-gray-200 border-b-[3px] rounded-lg p-5 hover:border-gray-900 transition-colors'

function ToolCardBody({ tool, external }) {
  return (
    <>
      <div className="flex items-center gap-3">
        <span className="h-9 w-9 shrink-0 grid place-items-center rounded bg-gray-900 text-white">
          <ToolIcon name={tool.icon} />
        </span>
        <h3 className="font-display text-base font-medium uppercase tracking-wide leading-tight text-gray-900 group-hover:underline">
          {tool.name}{external && ' ↗'}
        </h3>
        {tool.path && isSupporterPath(tool.path) && <Badge className="ml-auto">Supporters</Badge>}
      </div>
      <p className="text-sm text-gray-500 leading-relaxed">{tool.description}</p>
    </>
  )
}

function ToolCard({ tool }) {
  if (tool.href) {
    return (
      <a href={tool.href} target="_blank" rel="noopener noreferrer" className={CARD}>
        <ToolCardBody tool={tool} external />
      </a>
    )
  }
  return (
    <Link to={tool.path} className={CARD}>
      <ToolCardBody tool={tool} />
    </Link>
  )
}

function PromoCard({ icon, title, body, cta, ...linkProps }) {
  const Tag = linkProps.to ? Link : 'a'
  return (
    <Tag
      {...linkProps}
      className="group flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-white border border-gray-200 rounded-lg px-6 py-5 hover:border-gray-900 transition-colors"
    >
      <span className="h-10 w-10 shrink-0 grid place-items-center rounded bg-ink">
        <img src={icon} alt="" className="h-5 w-auto" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-gray-900">{title}</span>
        <span className="block text-sm text-gray-500 mt-0.5">{body}</span>
      </span>
      <span className="sm:ml-auto shrink-0 font-display text-sm uppercase tracking-wider text-forge-ink group-hover:underline">
        {cta} →
      </span>
    </Tag>
  )
}

export function HomePage() {
  return (
    <div className="w-full px-6 py-8 flex flex-col gap-12">
      <div>
        <img
          src="/inkborn_forge_substack_header.png"
          alt="InkbornForge — Hone Your Approach, Sharpen Your Play"
          className="brand-banner w-full h-auto rounded-lg border border-gray-200"
        />
        <p className="text-gray-500 mt-4">
          A growing suite of tools for Disney Lorcana players.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PromoCard
          to="/settings"
          icon="/metafy-icon.svg"
          title="Become a Metafy supporter"
          body="Unlock deck insights, game scouting, analytics, and more supporter-only tools."
          cta="Support us"
        />
        <PromoCard
          href={SUBSTACK_URL}
          target="_blank"
          rel="noopener noreferrer"
          icon="/substack-icon.svg"
          title="Join us on Substack"
          body="Strategy articles, tool updates, and Lorcana news — straight to your inbox."
          cta="Subscribe"
        />
      </div>

      {SECTIONS.map(section => (
        <section key={section.title}>
          <div className="flex items-baseline gap-3 border-b-2 border-gray-900 pb-2 mb-5">
            <h2 className="font-display text-xl font-medium uppercase tracking-wide text-gray-900">
              {section.title}
            </h2>
            <span className="text-sm text-gray-500">
              {section.tools.length} {section.tools.length === 1 ? 'tool' : 'tools'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
            {section.tools.map(tool => (
              <ToolCard key={tool.path || tool.href} tool={tool} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
