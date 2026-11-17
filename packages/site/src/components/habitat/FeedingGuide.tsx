import * as React from "react";
import { FEEDING_GUIDE } from "@dlab5/permtek5-core";
import { useT } from "../../lib/i18n";

type Lang = "en" | "de" | "fr";
const CLASSES = ["yes", "limited", "never", "browns"] as const;
const fill = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ""));

/**
 * The WormBed5 feeding guide (packages/ontology/guides/wormbed5-feeding.json), folded
 * under its guild. The data is the guide; the twin edge enforces it, this only shows it.
 */
export function FeedingGuide() {
  const { t, lang } = useT();
  const l = (["en", "de", "fr"].includes(lang) ? lang : "en") as Lang;
  const g = FEEDING_GUIDE;
  const kinds = Object.values(g.kinds) as readonly { class: string; label: Record<Lang, string>; weeklySharePct?: number }[];
  const r = g.rules, x = g.ruleTexts;
  const rules = [
    x.browns[l], x.amount[l], fill(x.spot[l], { g: r.maxGramsPerSpot }), fill(x.rest[l], { h: r.minHoursBetweenFeedings }),
    fill(x.cold[l], { c: r.minCoreC }),
  ];
  return (
    <details className="pt-guide">
      <summary>{t("hab.guide.title")}</summary>
      <p className="pt-muted">{g.about[l]}</p>
      <dl className="pt-guide__kinds">
        {CLASSES.map((c) => (
          <React.Fragment key={c}>
            <dt className={`pt-guide__class pt-guide__class--${c}`}>{g.classes[c][l]}</dt>
            <dd>{kinds.filter((k) => k.class === c).map((k) => k.label[l] + (k.weeklySharePct ? ` (≤ ${k.weeklySharePct} %)` : "")).join(", ")}</dd>
          </React.Fragment>
        ))}
      </dl>
      <ul>{rules.map((text) => <li key={text}>{text}</li>)}</ul>
      <ul className="pt-muted">{g.preparation.map((p) => <li key={p.en}>{p[l]}</li>)}</ul>
    </details>
  );
}
