# Demo narration script

Voiceover for `demo/out/demo-silent.mp4` (1:36, made by `npm run demo:capture`
in `app/`). The video shows the issuer-mismatch pair from
`demo/pairs/01_issuer_mismatch/`. All data on screen is synthetic.

Timestamps come from the capture timeline (`demo/out/timeline.json`). A fresh
capture can drift by about a second, so check that file if a cue feels early or late.
Read at a relaxed pace, about two and a half words per second.

## Full version (about 1:36)

| Time | On screen | Say |
| ---- | --------- | --- |
| 0:00 | Both files loaded, not yet compared. | "Two systems disagree about the same study, and the answer is buried in a few hundred header tags." |
| 0:07 | (same) | "I built this after chasing those mismatches in nuclear cardiology integrations, one tag at a time." |
| 0:14 | Compare runs; the table appears. | "One keystroke compares them." |
| 0:16 | Full table, all 90 rows. | "Here's every tag in both files, side by side." |
| 0:20 | Table scrolls to the bottom and back. | "These are two copies of the same synthetic cardiac study, one from each side of an interface. The tags that decide whether a study lands on the right patient, like patient ID, issuer, accession number and the UIDs, are pinned at the top. Scrolling through the rest by eye is how things get missed." |
| 0:38 | "Differences only" turns on; one row is left. | "Turn on Differences only, and the noise is gone. One row is left: Issuer of Patient ID." |
| 0:44 | (same) | "Same patient ID, issued by two different hospitals. Ignore the issuer, and two people can merge into one record." |
| 0:51 | Row selected; details at the bottom. | "Clicking the row shows the full values. It's flagged as a priority mismatch, which is why the badge at the top is red. Everything else matches, and that's the trap: the fields people usually check all look fine." |
| 1:07 | Export; "Saved" appears top right. | "Control-E saves a report, and here it is." |
| 1:12 | The HTML report. | "One HTML file: fingerprints of both files, the summary, and the priority mismatches first. Attach it to a ticket." |
| 1:20 | (report stays on screen) | "It runs entirely on your machine. Nothing is uploaded, files are only read, headers only, never images. Everything you've seen is synthetic test data." |
| 1:30 | (same, to the end) | "DICOM Inspector: two files in, the one difference that matters out." |

## 30-second cut

Cut the video to these ranges of `demo-silent.mp4`, in order (about 30 seconds
in total), and read the matching line over each.

| Video range | Cut time | Say |
| ----------- | -------- | --- |
| 0:00–0:05 | 0:00 | "Two systems disagree about one study. The answer is buried in hundreds of tags." |
| 0:14–0:20 | 0:05 | "DICOM Inspector compares two files in one keystroke. Here's every tag, side by side." |
| 0:38–0:48 | 0:11 | "Differences only: one row. Same patient ID, but issued by two different hospitals, the kind of mismatch that merges two people into one record." |
| 1:07–1:16 | 0:21 | "One key saves a report you can attach to a ticket. It all runs offline, header-only, and no patient data leaves the machine." |
