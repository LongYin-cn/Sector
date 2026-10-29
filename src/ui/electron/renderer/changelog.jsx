import React from "react";
import releasesEn from "../shared/changelog.json";
import releasesZh from "../shared/changelog.zh.json";
import { useLocale, useT } from "./i18n.jsx";
import "./changelog.css";

// The release notes are content, not interface strings: they ship as one file
// per language so the translation stays readable instead of 113 flat keys.
const SOURCES = { en: releasesEn, "zh-CN": releasesZh };

export function Changelog() {
  const t = useT();
  const locale = useLocale();
  const releases = SOURCES[locale] || releasesEn;
  return (
    <div
      className="changelog-list"
      tabIndex={0}
      aria-label={t("changelog.aria")}
    >
      {releases.map(({ version, changes }, index) => (
        <section key={version} aria-labelledby={`release-${version}`}>
          <h3 id={`release-${version}`}>
            {version}
            {index === 0 && <span>{t("changelog.latest")}</span>}
          </h3>
          <ul>
            {/* Translated sentences can repeat, so the index is the stable id. */}
            {changes.map((change, entryIndex) => (
              <li key={entryIndex}>{change}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
