// Print the manual steps for publishing a release. Prints only; runs nothing.
// Usage: npm run release:checklist
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = join(dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(readFileSync(join(APP, 'package.json'), 'utf8'))
const tag = `v${version}`
const installer = `release/DICOM-Inspector-Setup-${version}.exe`
const notes = `docs/RELEASE_NOTES_${tag}.md`

const steps = [
  [
    'Build on Windows from a clean clone of the commit to release',
    [
      'Prerequisites: Windows 10/11 x64, PowerShell 7.2+, Python 3.11+, Node.js LTS, Git.',
      'To sign: set CSC_LINK (path to or base64 of the .pfx) and CSC_KEY_PASSWORD first.',
      'pwsh ./build/build_windows.ps1',
      `Expect "BUILD SUCCEEDED" and ${installer}. Note the SHA-256 it prints.`,
    ],
  ],
  [
    'Verify the installer',
    [
      'pwsh ./build/smoke_test_installer.ps1   (silent install, engine with Python off PATH, uninstall)',
      'Work through docs/CLEAN_MACHINE_TEST.md in Windows Sandbox or a fresh VM.',
      'Optional: cd app && npm run test:e2e   (command-line launch tests against the built app)',
    ],
  ],
  [
    'Check the notes and the version',
    [
      `Read ${notes} and update it if anything changed.`,
      `app/package.json version is ${version}; the tag will be ${tag}.`,
    ],
  ],
  [
    'Tag and push (CI then builds and smoke-tests the same commit)',
    [`git tag -a ${tag} -m "DICOM Inspector ${version}"`, `git push origin ${tag}`],
  ],
  [
    'Create the GitHub release as a draft and upload the installer',
    [
      `gh release create ${tag} --draft --title "DICOM Inspector ${version}" --notes-file ${notes}`,
      `gh release upload ${tag} ${installer}`,
      'Add the installer SHA-256 from step 1 to the release description.',
    ],
  ],
  [
    'Publish',
    [
      'Open the draft on GitHub, download the installer once and check its SHA-256 matches.',
      `gh release edit ${tag} --draft=false`,
    ],
  ],
]

console.log(`Release checklist for DICOM Inspector ${version}\n`)
steps.forEach(([title, lines], index) => {
  console.log(`${index + 1}. ${title}`)
  for (const line of lines) console.log(`   ${line}`)
  console.log('')
})
console.log('Nothing above has been run. Each step is manual.')
