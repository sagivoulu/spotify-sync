import { defineConfig } from 'vitepress'

const commandItems = [
  { text: 'auth', link: '/commands/auth' },
  { text: 'sync', link: '/commands/sync' },
  { text: 'status', link: '/commands/status' },
  { text: 'import', link: '/commands/import' },
  { text: 'prune', link: '/commands/prune' },
  { text: 'doctor', link: '/commands/doctor' },
]

export default defineConfig({
  title: 'spotify-sync',
  description: 'CLI tool to sync a Spotify playlist to a local music library',
  base: '/spotify-sync/',

  themeConfig: {
    nav: [
      { text: 'Getting Started', link: '/getting-started' },
      { text: 'Configuration', link: '/configuration' },
      {
        text: 'Commands',
        items: commandItems,
      },
      { text: 'Troubleshooting', link: '/troubleshooting' },
      { text: '✦ openbeat preview', link: 'https://sagivoulu.github.io/spotify-sync/mockup.html' },
    ],

    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting Started', link: '/getting-started' },
          { text: 'Configuration', link: '/configuration' },
          { text: 'Troubleshooting', link: '/troubleshooting' },
        ],
      },
      {
        text: 'Commands',
        items: commandItems,
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/sagivoulu/spotify-sync' },
    ],

    footer: {
      message: 'Released under the ISC License.',
    },
  },
})
