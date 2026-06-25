# Integrations

GlanceOS connects to **137 data sources**. Each is a server-side *provider* — it knows how
to fetch a *resource* and return a raw payload, which a block's **SourceMap** then shapes to
fit. Binding happens in the Studio's **⟿ Data** tab (or one-click via a provider's preset
"objects" on **Settings → Connections**). Tokens and secret URLs are encrypted on the server
and never returned to the browser; every outbound fetch is SSRF-guarded.

**Auth kinds:** `keyless` (no login — works immediately) · `url` (a secret/public URL) ·
`token` / `apiKey` (paste a personal token) · `OAuth` (sign in; the self-hoster supplies the
client id/secret in `oauth_apps`). OAuth/token providers appear in the catalog and light up
once connected.

**Architecture note:** providers live entirely in `apps/server` — adding one costs the
screen runtime **zero** bytes (the e-ink/TV bundle stays under its 30 KB gzip gate). The
existing BINDABLE blocks (lists → `bulletList`, scalars → `stat`, series → `sparkline`,
typed shapes → `headlines`/`calendar`) render the data; no new screen renderers are needed.

## Preset objects

Many providers ship ready-to-insert **objects** (see `apps/config/src/editor/integrationObjects.ts`):
a preset is an existing block pre-bound to that provider's source (`{kind, query, map}`). On
**Settings → Connections**, click a provider's `+ <object>` chip to copy it to the Studio
clipboard, then paste it onto any board with ⌘V and pick the connection in the Data tab.

## Catalog

### Tasks (7)
- **Asana** `asana` · token · asana.tasks, asana.projects
- **ClickUp** `clickup` · token · clickup.tasks
- **Google Tasks** `googletasks` · OAuth · googletasks.tasks
- **Height** `height` · token · height.tasks
- **monday.com** `monday` · token · monday.items
- **Todoist** `todoist` · token · todoist.tasks, todoist.projects
- **Trello** `trello` · token · trello.cards, trello.boards

### Issues (3)
- **Jira** `jira` · token · jira.search
- **Linear** `linear` · token · linear.issues
- **Shortcut** `shortcut` · token · shortcut.stories

### Docs & sheets (4)
- **Airtable** `airtable` · token · airtable.records
- **Dropbox** `dropbox` · OAuth · dropbox.space
- **Google Sheet (published CSV)** `sheets` · url · sheets.csv
- **Notion** `notion` · OAuth · notion.database

### Developer (12)
- **Bitbucket** `bitbucket` · token · bitbucket.prs
- **CircleCI** `circleci` · token · circleci.pipelines
- **Cloudflare** `cloudflare` · token · cloudflare.zones
- **DEV.to** `devto` · keyless · devto.articles
- **Figma** `figma` · OAuth · figma.me
- **GitHub** `github` · OAuth · github.search, github.issues, github.repo, github.commits
- **GitLab** `gitlab` · token · gitlab.issues, gitlab.mrs, gitlab.pipelines
- **Lobsters** `lobsters` · keyless · lobsters.hottest
- **Netlify** `netlify` · token · netlify.sites, netlify.deploys
- **npm** `npm` · keyless · npm.downloads
- **Vercel** `vercel` · token · vercel.deployments
- **WakaTime** `wakatime` · token · wakatime.stats

### Observability (5)
- **Better Stack (Uptime)** `betteruptime` · token · betteruptime.monitors
- **PagerDuty** `pagerduty` · token · pagerduty.incidents
- **Sentry** `sentry` · token · sentry.issues
- **Statuspage** `statuspage` · token · statuspage.incidents
- **UptimeRobot** `uptimerobot` · apiKey · uptimerobot.monitors

### Calendar (6)
- **Calendar (iCal URL)** `ical` · url · ical.events
- **Calendly** `calendly` · OAuth · calendly.me, calendly.events
- **Google Calendar** `google` · OAuth · google.calendar
- **Microsoft 365 / Outlook** `microsoft` · OAuth · microsoft.calendar
- **Public Holidays** `nager` · keyless · nager.next
- **Zoom** `zoom` · OAuth · zoom.meetings

### Mail (2)
- **Gmail (unread)** `gmail` · OAuth · gmail.unread
- **Outlook mail (unread)** `outlookmail` · OAuth · outlookmail.unread

### Smart home (1)
- **Home Assistant** `homeassistant` · token · homeassistant.entity, homeassistant.history

### Chat (1)
- **Slack** `slack` · OAuth · slack.messages, slack.channels

### Media (14)
- **Anime (Jikan / MyAnimeList)** `jikan` · keyless · jikan.top, jikan.search
- **Apple iTunes Search** `itunes` · keyless · itunes.search
- **Deezer** `deezer` · keyless · deezer.search
- **Last.fm** `lastfm` · apiKey · lastfm.recent, lastfm.topartists
- **ListenBrainz** `listenbrainz` · token · listenbrainz.listens
- **MusicBrainz** `musicbrainz` · keyless · musicbrainz.artists
- **Plex** `plex` · token · plex.recentlyAdded, plex.sessions
- **Radarr** `radarr` · apiKey · radarr.calendar, radarr.queue
- **Sonarr** `sonarr` · apiKey · sonarr.calendar, sonarr.queue
- **Spotify** `spotify` · OAuth · spotify.nowplaying
- **Tautulli** `tautulli` · apiKey · tautulli.activity
- **Trakt** `trakt` · apiKey · trakt.trendingShows, trakt.trendingMovies
- **TVmaze** `tvmaze` · keyless · tvmaze.search, tvmaze.schedule
- **YouTube** `youtube` · OAuth · youtube.stats, youtube.subscriptions

### Social (4)
- **Bluesky** `bluesky` · keyless · bluesky.feed, bluesky.profile
- **Discord** `discord` · OAuth · discord.guilds, discord.user
- **Mastodon** `mastodon` · keyless · mastodon.timeline
- **Reddit** `reddit` · keyless · reddit.posts

### News (1)
- **Hacker News** `hackernews` · keyless · hackernews.top, hackernews.search

### Gaming (7)
- **CheapShark Game Deals** `cheapshark` · keyless · cheapshark.deals
- **Dota 2 (OpenDota)** `opendota` · keyless · opendota.heroes
- **Free-to-Play Games** `freetogame` · keyless · freetogame.games
- **PokéAPI** `pokeapi` · keyless · pokeapi.list
- **Scryfall (MTG)** `scryfall` · keyless · scryfall.search
- **Steam** `steam` · keyless · steam.players
- **Twitch** `twitch` · OAuth · twitch.user

### Sports (4)
- **ESPN Scoreboard** `espn` · keyless · espn.scoreboard
- **Formula 1** `f1` · keyless · f1.next
- **MLB Scores** `mlb` · keyless · mlb.schedule
- **TheSportsDB** `thesportsdb` · keyless · thesportsdb.next, thesportsdb.last

### Books (2)
- **Open Library** `openlibrary` · keyless · openlibrary.search
- **Project Gutenberg** `gutendex` · keyless · gutendex.search

### Reference (7)
- **Datamuse (words)** `datamuse` · keyless · datamuse.related
- **Dictionary** `dictionary` · keyless · dictionary.define
- **FIRST.org Countries** `firstorg` · keyless · firstorg.countries
- **PoetryDB** `poetrydb` · keyless · poetrydb.random
- **Quotable** `quotable` · keyless · quotable.random
- **Wikipedia** `wikipedia` · keyless · wikipedia.onthisday, wikipedia.search
- **World Bank** `worldbank` · keyless · worldbank.indicator

### Science (4)
- **GBIF Biodiversity** `gbif` · keyless · gbif.species
- **Natural Events (NASA)** `eonet` · keyless · eonet.events
- **Open-Meteo Air Quality** `openmeteoair` · keyless · openmeteoair.current
- **Open-Meteo Marine** `openmarine` · keyless · openmarine.current

### Space (3)
- **ISS tracker** `iss` · keyless · iss.position
- **Spaceflight News** `spaceflightnews` · keyless · spaceflightnews.articles
- **SpaceX** `spacex` · keyless · spacex.upcoming

### Weather (2)
- **Civil Forecast** `civilweather` · keyless · civilweather.daily
- **US Weather Alerts** `nws` · keyless · nws.alerts

### Travel & place (4)
- **Postal Code Lookup** `zippopotam` · keyless · zippopotam.place
- **Sunrise / Sunset** `sunrise` · keyless · sunrise.times
- **Travel time (OSRM)** `osrm` · keyless · osrm.route
- **World Time** `worldtime` · keyless · worldtime.now

### Food & drink (3)
- **Open Brewery DB** `openbrewerydb` · keyless · openbrewerydb.byCity
- **TheCocktailDB** `thecocktaildb` · keyless · thecocktaildb.search, thecocktaildb.random
- **TheMealDB (recipes)** `themealdb` · keyless · themealdb.search, themealdb.random

### Art (1)
- **Art Institute of Chicago** `artic` · keyless · artic.artworks, artic.search

### Fun (9)
- **Advice Slip** `adviceslip` · keyless · adviceslip.random
- **Affirmations** `affirmations` · keyless · affirmations.random
- **Cat Facts** `catfact` · keyless · catfact.random
- **Chuck Norris Jokes** `chucknorris` · keyless · chucknorris.random
- **Dad Jokes** `dadjoke` · keyless · dadjoke.random
- **Official Joke API** `officialjoke` · keyless · officialjoke.list, officialjoke.random
- **Open Trivia DB** `opentdb` · keyless · opentdb.questions
- **Random Facts** `uselessfacts` · keyless · uselessfacts.random
- **xkcd** `xkcd` · keyless · xkcd.latest

### Finance (9)
- **Binance (crypto)** `binance` · keyless · binance.tickers
- **Blockchain.com Stats** `blockchaininfo` · keyless · blockchaininfo.btcprice
- **Coinbase** `coinbase` · OAuth · coinbase.accounts
- **CoinGecko** `coingecko` · keyless · coingecko.markets, coingecko.trending
- **CoinLore** `coinlore` · keyless · coinlore.top
- **Coinpaprika** `coinpaprika` · keyless · coinpaprika.tickers, coinpaprika.global
- **Frankfurter (FX)** `frankfurter` · keyless · frankfurter.rates
- **mempool.space Fees** `mempool` · keyless · mempool.fastestfee
- **Open Exchange Rates** `openexchangerates` · apiKey · openexchangerates.latest

### Money (4)
- **Lemon Squeezy** `lemonsqueezy` · token · lemonsqueezy.orders
- **Paddle** `paddle` · token · paddle.transactions
- **Stripe** `stripe` · token · stripe.balance, stripe.charges
- **YNAB** `ynab` · token · ynab.budgets, ynab.accounts

### Analytics (5)
- **Fathom Analytics** `fathom` · token · fathom.aggregations
- **Plausible Analytics** `plausible` · token · plausible.aggregate
- **PostHog** `posthog` · token · posthog.insights
- **Simple Analytics** `simpleanalytics` · token · simpleanalytics.stats
- **Umami Analytics** `umami` · token · umami.stats

### Health (4)
- **Fitbit** `fitbit` · OAuth · fitbit.steps, fitbit.sleep
- **Oura Ring** `oura` · token · oura.activity, oura.sleep
- **Strava** `strava` · OAuth · strava.activities, strava.stats
- **WHOOP** `whoop` · OAuth · whoop.recovery, whoop.sleep

### Time tracking (2)
- **Harvest** `harvest` · token · harvest.timeEntries
- **Toggl Track** `toggl` · token · toggl.current

### Bookmarks (2)
- **Pinboard** `pinboard` · token · pinboard.recent
- **Raindrop.io** `raindrop` · token · raindrop.bookmarks

### Civic (2)
- **Health stats (disease.sh)** `diseasesh` · keyless · diseasesh.country
- **USGS Earthquakes** `usgs` · keyless · usgs.quakes

### Generic (3)
- **GraphQL** `graphql` · token · graphql
- **REST / JSON** `rest` · apiKey · rest
- **RSS / Atom** `rss` · keyless · rss.feed
