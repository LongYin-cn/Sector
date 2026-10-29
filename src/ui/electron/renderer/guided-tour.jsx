import React, { useLayoutEffect, useRef, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { Icon } from "@iconify/react";
import arrowLeft from "@iconify-icons/solar/arrow-left-linear";
import arrowRight from "@iconify-icons/solar/arrow-right-linear";
import { useT } from "./i18n.jsx";

export function GuidedTour({ saveKey, restoreKey, onTabChange, onFinish }) {
  const t = useT();
  // Every step is retranslated on render so the popover follows a language
  // change; the keys themselves stay stable.
  const steps = [
    {
      target: "launch",
      title: t("tour.launch.title"),
      text: t("tour.launch.text"),
      side: "bottom",
    },
    {
      target: "checkpoint",
      title: t("tour.checkpoint.title"),
      text: t("tour.checkpoint.text", { save: saveKey, restore: restoreKey }),
      side: "bottom",
    },
    {
      target: "shortcuts",
      title: t("tour.shortcuts.title"),
      text: t("tour.shortcuts.text"),
      side: "top",
    },
    {
      target: "audio",
      title: t("tour.audio.title"),
      text: t("tour.audio.text"),
      side: "top",
    },
    {
      target: "connection",
      title: t("tour.connection.title"),
      text: t("tour.connection.text"),
      side: "top",
    },
    {
      target: "settings",
      title: t("tour.settings.title"),
      text: t("tour.settings.text"),
      side: "bottom",
    },
    {
      target: "overlay",
      title: t("tour.overlay.title"),
      text: t("tour.overlay.text"),
      side: "bottom",
      tab: "overlay",
    },
    {
      target: "background",
      title: t("tour.background.title"),
      text: t("tour.background.text"),
      side: "bottom",
    },
  ];
  const [index, setIndex] = useState(0);
  const [anchor, setAnchor] = useState(null);
  const nextButton = useRef(null);
  const step = steps[index];

  useLayoutEffect(() => {
    onTabChange(step.tab || "reset");
    let target;
    // Tabs mount their content after the selection update. Measure the actual
    // element so the arrow also follows scrolling, resizing and compact layouts.
    const frame = requestAnimationFrame(() => {
      target = document.querySelector(`[data-tour="${step.target}"]`);
      if (!target) return;
      target.scrollIntoView({
        block: "start",
        inline: "nearest",
        behavior: "instant",
      });
      target.dataset.tourActive = "true";
      setAnchor(target);
    });
    return () => {
      cancelAnimationFrame(frame);
      if (target) delete target.dataset.tourActive;
    };
  }, [index, onTabChange, step.target, step.tab]);

  return (
    <Popover.Root
      open={Boolean(anchor)}
      modal
      onOpenChange={(open) => {
        if (!open) onFinish();
      }}
    >
      <Popover.Portal>
        <Popover.Backdrop className="tour-backdrop" />
        <Popover.Positioner
          className="tour-positioner"
          anchor={anchor}
          side={step.side}
          align="center"
          sideOffset={14}
          collisionPadding={16}
          collisionAvoidance={{ side: "shift", align: "shift" }}
          sticky
          positionMethod="fixed"
        >
          <Popover.Popup
            className="tour-popup"
            data-motion-step={index % 2}
            initialFocus={nextButton}
            finalFocus={() => document.querySelector(".guide-menu-trigger")}
          >
            <Popover.Arrow className="tour-arrow">
              <svg
                width="20"
                height="10"
                viewBox="0 0 20 10"
                aria-hidden="true"
              >
                <path d="M0 10 10 0 20 10" />
              </svg>
            </Popover.Arrow>
            <div aria-live="polite" aria-atomic="true">
              <span className="tour-progress">
                {t("tour.progress", {
                  index: index + 1,
                  total: steps.length,
                })}
              </span>
              <Popover.Title>{step.title}</Popover.Title>
              <Popover.Description>{step.text}</Popover.Description>
            </div>
            <div className="tour-actions">
              <Popover.Close className="text-button">
                {t("tour.skip")}
              </Popover.Close>
              <button
                className="secondary"
                aria-label={t("tour.previous")}
                disabled={index === 0}
                onClick={() => setIndex(index - 1)}
              >
                <Icon icon={arrowLeft} aria-hidden="true" />
              </button>
              <button
                className="primary"
                ref={nextButton}
                onClick={() =>
                  index === steps.length - 1 ? onFinish() : setIndex(index + 1)
                }
              >
                {index === steps.length - 1 ? t("tour.finish") : t("tour.next")}
                <Icon icon={arrowRight} aria-hidden="true" />
              </button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
