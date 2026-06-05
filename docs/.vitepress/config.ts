import { defineConfig } from 'vitepress'

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
        items: [
          { text: 'auth', link: '/commands/auth' },
          { text: 'sync', link: '/commands/sync' },
          { text: 'status', link: '/commands/status' },
          { text: 'import', link: '/commands/import' },
          { text: 'prune', link: '/commands/prune' },
          { text: 'doctor', link: '/commands/doctor' },
        ],
      },
      { text: 'Troubleshooting', link: '/troubleshooting' },
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
        items: [
          { text: 'auth', link: '/commands/auth' },
          { text: 'sync', link: '/commands/sync' },
          { text: 'status', link: '/commands/status' },
          { text: 'import', link: '/commands/import' },
          { text: 'prune', link: '/commands/prune' },
          { text: 'doctor', link: '/commands/doctor' },
        ],
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
