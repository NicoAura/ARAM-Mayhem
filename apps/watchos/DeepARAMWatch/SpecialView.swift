import DeepARAMWatchKit
import SwiftUI

/// Today's Chef's Special from The Lab.
struct SpecialView: View {
    let special: ChefsSpecial

    var body: some View {
        List {
            Section {
                HStack(spacing: 10) {
                    ChampionIcon(url: special.iconURL, size: 40)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(special.title).font(.headline)
                        Text(special.name).font(.caption2).foregroundStyle(.secondary)
                        if let tier = special.tier, !tier.isEmpty {
                            Text(tier).font(.caption2.bold()).foregroundStyle(Theme.accent)
                        }
                    }
                }
                .listRowBackground(Color.clear)
            }
            if let play = special.play, !play.isEmpty {
                Section("How to play") { Text(play).font(.footnote) }
            }
            if !special.augments.isEmpty {
                Section("Augments") {
                    ForEach(special.augments, id: \.self) { a in
                        HStack(spacing: 6) {
                            Circle().fill(Theme.rarity(a.rarity)).frame(width: 6, height: 6)
                            Text(a.name).font(.footnote)
                        }
                    }
                }
            }
            if !special.items.isEmpty {
                Section("Build") {
                    ForEach(Array(special.items.enumerated()), id: \.offset) { i, item in
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Text("\(i + 1)").font(.caption2.monospacedDigit()).foregroundStyle(.secondary)
                            Text(item).font(.footnote)
                        }
                    }
                }
            }
        }
        .navigationTitle("Chef's Special")
    }
}
