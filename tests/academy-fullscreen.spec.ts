import { expect, test, type Route } from "@playwright/test";
import { academyInitScript as academyInit } from "./academy-script.mjs";

const lessonHeader = `
  <div class="jsx-2501835884 nav" style="padding: 0 0 0 60px">
    <a href="/" class="jsx-2501835884">
      <img alt="school logo" src="https://images.ctfassets.net/ztm-logo-academy.svg" class="jsx-2501835884 logo">
    </a>
    <div class="jsx-3115489796 wrap"></div>
  </div>`;

test.beforeEach(async ({ context, page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  const fulfillAcademy = (route: Route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head></head><body>${lessonHeader}</body></html>`,
    });
  await context.route("https://academy.zerotomastery.io/**", fulfillAcademy);
  await context.route("https://sso.teachable.com/**", fulfillAcademy);
  await context.addInitScript({
    content: `
      window.__ZTM_DESKTOP_VIEW__ = location.search.includes("embedded")
        ? "embedded"
        : "fullscreen";
      window.__ZTM_DESKTOP_THEME__ = "dark";
      try {
        window.__ZTM_DESKTOP_RESTORE__ = JSON.parse(
          sessionStorage.getItem("ztm-test-native-restore")
        ) || undefined;
      } catch {}
      window.__ZTM_DESKTOP_CALLS__ = [];
      window.__TAURI_INTERNALS__ = {
        invoke(command, args) {
          window.__ZTM_DESKTOP_CALLS__.push({ command, args });
          return Promise.resolve();
        }
      };
      ${academyInit}
    `,
  });
  await page.goto("https://academy.zerotomastery.io/lessons/current-lesson");
});

test("the real Academy logo becomes a fullscreen exit and cannot navigate home", async ({
  page,
}) => {
  const logo = page.getByAltText("school logo");
  const link = logo.locator("xpath=ancestor::a");

  await expect(logo).toBeVisible();
  await expect(link).not.toHaveAttribute("href", "/");
  await expect(link).toHaveAttribute("role", "button");
  await expect(link).toHaveAttribute("title", "Return to ZTM Desktop");

  await logo.click();

  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          globalThis as typeof globalThis & {
            __ZTM_DESKTOP_CALLS__: Array<{
              command: string;
              args: { fullscreen: boolean; session: { url: string } };
            }>;
          }
        ).__ZTM_DESKTOP_CALLS__.at(-1),
      ),
    )
    .toMatchObject({
      command: "web_view_fullscreen",
      args: {
        fullscreen: false,
        session: {
          url: "https://academy.zerotomastery.io/lessons/current-lesson",
        },
      },
    });
  await expect(page).toHaveURL(
    "https://academy.zerotomastery.io/lessons/current-lesson",
  );
});

test("the Academy page follows the app theme and rejects site overrides", async ({
  page,
}) => {
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");

  await page.evaluate(() => {
    document.documentElement.className = "light";
    document.documentElement.dataset.theme = "light";
    document.documentElement.style.colorScheme = "light";
  });

  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("html")).not.toHaveClass(/light/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");

  await page.evaluate(() => {
    (
      window as typeof window & {
        __ZTM_DESKTOP_SET_THEME__: (theme: string) => void;
      }
    ).__ZTM_DESKTOP_SET_THEME__("light");
  });
  await expect(page.locator("html")).toHaveClass(/light/);
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
});

test("a theme reset reload cannot restore the webview creation-time theme", async ({
  page,
}) => {
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.evaluate(() => {
    (
      window as typeof window & {
        __ZTM_DESKTOP_SET_THEME__: (theme: string) => void;
      }
    ).__ZTM_DESKTOP_SET_THEME__("light");
  });
  await page.reload();

  await expect(page.locator("html")).toHaveClass(/light/);
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expect(page.locator("html")).toHaveCSS("color-scheme", "light");

  await page.evaluate(() => {
    (
      window as typeof window & {
        __ZTM_DESKTOP_SET_THEME__: (theme: string) => void;
      }
    ).__ZTM_DESKTOP_SET_THEME__("dark");
  });
  await page.reload();

  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("html")).not.toHaveClass(/light/);
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
});

for (const savedPaused of [false, true]) {
  test(`reopening a course restores a ${savedPaused ? "paused" : "playing"} session`, async ({
    page,
  }) => {
    const lessonUrl =
      "https://academy.zerotomastery.io/courses/697434/lectures/12345";
    await page.goto(lessonUrl);
    await page.evaluate((paused) => {
      const video = document.createElement("video");
      Object.defineProperties(video, {
        currentTime: { configurable: true, writable: true, value: 93.25 },
        paused: { configurable: true, value: paused },
        playbackRate: { configurable: true, writable: true, value: 1.5 },
        readyState: { configurable: true, value: 1 },
      });
      document.body.appendChild(video);
      (
        window as typeof window & {
          __ZTM_DESKTOP_SAVE_SESSION__: () => void;
        }
      ).__ZTM_DESKTOP_SAVE_SESSION__();
    }, savedPaused);

    await page.goto("https://academy.zerotomastery.io/courses/enrolled/697434");
    await expect(page).toHaveURL(lessonUrl);

    const restored = await page.evaluate((initiallyPaused) => {
      const video = document.createElement("video");
      let paused = initiallyPaused;
      Object.defineProperties(video, {
        currentTime: { configurable: true, writable: true, value: 0 },
        paused: { configurable: true, get: () => paused },
        playbackRate: { configurable: true, writable: true, value: 1 },
        readyState: { configurable: true, value: 1 },
        play: {
          configurable: true,
          value: async () => {
            paused = false;
          },
        },
        pause: {
          configurable: true,
          value: () => {
            paused = true;
          },
        },
      });
      document.body.appendChild(video);
      return new Promise<{
        currentTime: number;
        paused: boolean;
        playbackRate: number;
      }>((resolve) =>
        requestAnimationFrame(() =>
          resolve({
            currentTime: video.currentTime,
            paused: video.paused,
            playbackRate: video.playbackRate,
          }),
        ),
      );
    }, !savedPaused);
    expect(restored).toEqual({
      currentTime: 93.25,
      paused: savedPaused,
      playbackRate: 1.5,
    });
  });
}

test("media inside a player frame participates in fullscreen session capture", async ({
  page,
}) => {
  await page.evaluate(() => {
    const frame = document.createElement("iframe");
    frame.srcdoc = "<!doctype html><html><body></body></html>";
    frame.title = "Course video";
    document.body.appendChild(frame);
  });
  const player = page.frameLocator('iframe[title="Course video"]');
  await player.locator("body").waitFor({ state: "attached" });
  await player.locator("body").evaluate(async (body) => {
    const video = document.createElement("video");
    Object.defineProperties(video, {
      currentTime: { configurable: true, writable: true, value: 48.5 },
      paused: { configurable: true, value: false },
      playbackRate: { configurable: true, writable: true, value: 1.25 },
    });
    body.appendChild(video);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    video.dispatchEvent(new Event("timeupdate"));
  });

  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as typeof window & {
            __ZTM_DESKTOP_CAPTURE_SESSION__: () => {
              mediaTime: number | null;
              mediaPaused: boolean | null;
              playbackRate: number | null;
            };
          }
        ).__ZTM_DESKTOP_CAPTURE_SESSION__(),
      ),
    )
    .toMatchObject({
      mediaTime: 48.5,
      mediaPaused: false,
      playbackRate: 1.25,
    });

  // Do not dispatch timeupdate after changing the player. Native fullscreen
  // exit must actively ask the frame for its exact current value rather than
  // returning the last periodic checkpoint above.
  await player.locator("video").evaluate((video) => {
    (video as HTMLVideoElement).currentTime = 79.75;
  });
  await page.evaluate(() =>
    (
      window as typeof window & {
        __ZTM_DESKTOP_EXIT_FULLSCREEN__: () => Promise<void>;
      }
    ).__ZTM_DESKTOP_EXIT_FULLSCREEN__(),
  );
  await expect
    .poll(() =>
      page.evaluate(() => {
        const calls = (
          window as typeof window & {
            __ZTM_DESKTOP_CALLS__: Array<{
              args: { session?: { mediaTime?: number } };
            }>;
          }
        ).__ZTM_DESKTOP_CALLS__;
        return calls.at(-1)?.args.session?.mediaTime;
      }),
    )
    .toBe(79.75);
});

test("returning from fullscreen merges a URL-only fallback with saved video time", async ({
  page,
}) => {
  const lessonUrl =
    "https://academy.zerotomastery.io/courses/697434/lectures/67890";
  await page.goto(lessonUrl);
  await page.evaluate((url) => {
    const video = document.createElement("video");
    Object.defineProperties(video, {
      currentTime: { configurable: true, writable: true, value: 142.75 },
      paused: { configurable: true, value: true },
      playbackRate: { configurable: true, writable: true, value: 1.5 },
      readyState: { configurable: true, value: 1 },
    });
    document.body.appendChild(video);
    (
      window as typeof window & {
        __ZTM_DESKTOP_SAVE_SESSION__: () => void;
      }
    ).__ZTM_DESKTOP_SAVE_SESSION__();
    sessionStorage.setItem(
      "ztm-test-native-restore",
      JSON.stringify({
        url,
        scrollX: 0,
        scrollY: 0,
        mediaTime: null,
        mediaPaused: null,
        playbackRate: null,
      }),
    );
  }, lessonUrl);
  await page.reload();

  const restored = await page.evaluate(() => {
    sessionStorage.removeItem("ztm-test-native-restore");
    const video = document.createElement("video");
    Object.defineProperties(video, {
      currentTime: { configurable: true, writable: true, value: 0 },
      paused: { configurable: true, value: true },
      playbackRate: { configurable: true, writable: true, value: 1 },
      readyState: { configurable: true, value: 1 },
    });
    document.body.appendChild(video);
    return new Promise<{ currentTime: number; playbackRate: number }>(
      (resolve) =>
        requestAnimationFrame(() =>
          resolve({
            currentTime: video.currentTime,
            playbackRate: video.playbackRate,
          }),
        ),
    );
  });

  expect(restored).toEqual({ currentTime: 142.75, playbackRate: 1.5 });
});

test("Academy course navigation is removed from the document after every render", async ({
  page,
}) => {
  const renderNavigation = () =>
    page.evaluate(() => {
      document.body.insertAdjacentHTML(
        "beforeend",
        `<ul class="ztm-sidebar-links">
          <li><a href="https://academy.zerotomastery.io/">Dashboard</a></li>
          <li><a href="/courses/category/bootcamps">Bootcamps</a></li>
        </ul>`,
      );
    });

  await renderNavigation();
  await expect(page.locator(".ztm-sidebar-links")).toHaveCount(0);

  await renderNavigation();
  await expect(page.locator(".ztm-sidebar-links")).toHaveCount(0);
});

test("the embedded Academy page enforces the same app-selected theme", async ({
  page,
}) => {
  await page.goto(
    "https://academy.zerotomastery.io/lessons/current-lesson?embedded",
  );

  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");

  await page.evaluate(() => {
    document.documentElement.className = "light";
    document.documentElement.dataset.theme = "light";
    document.documentElement.style.colorScheme = "light";
  });

  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("html")).not.toHaveClass(/light/);
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
});

test("the embedded course overview normalizes only hard-coded neutral surfaces", async ({
  page,
}) => {
  await page.goto(
    "https://academy.zerotomastery.io/courses/enrolled/697434?embedded",
  );
  await page.evaluate(() => {
    document.body.innerHTML = `
      <main class="course-mainbar" style="background: rgb(255, 255, 255); color: rgb(15, 23, 42)">
        <section class="course-section" style="background: #fff; color: #111827">
          <div class="section-item" style="background: #f5f7fa; color: #172033">Introduction</div>
          <button style="background: rgb(245, 0, 87); color: white">Start Lesson</button>
          <img alt="course artwork" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==">
        </section>
      </main>`;
  });

  const section = page.locator(".course-section");
  const lesson = page.locator(".section-item");
  await expect(section).toHaveAttribute("data-ztm-dark-surface", "true");
  await expect(section).toHaveCSS("background-color", "rgb(24, 24, 24)");
  await expect(lesson).toHaveCSS("color", "rgb(245, 245, 245)");
  await expect(page.getByRole("button", { name: "Start Lesson" })).toHaveCSS(
    "background-color",
    "rgb(245, 0, 87)",
  );
  await expect(page.getByAltText("course artwork")).not.toHaveAttribute(
    "data-ztm-dark-surface",
    "true",
  );
});

test("the Academy dashboard follows the app light palette", async ({
  page,
}) => {
  await page.goto("https://academy.zerotomastery.io/?embedded");
  await page.evaluate(() => {
    (
      window as typeof window & {
        __ZTM_DESKTOP_SET_THEME__: (theme: string) => void;
      }
    ).__ZTM_DESKTOP_SET_THEME__("light");
    document.body.innerHTML = `
      <main class="catalog" style="background: rgb(32, 32, 32); color: white">
        <section class="course-card" style="background: rgb(24, 24, 24); color: rgb(245, 245, 245)">
          <span>Course title</span>
          <button style="background: rgb(245, 0, 87); color: white">Open course</button>
          <img alt="course artwork" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==">
        </section>
      </main>`;
  });

  const catalog = page.locator(".catalog");
  const card = page.locator(".course-card");
  await expect(page.locator("html")).toHaveAttribute(
    "data-ztm-light-palette",
    "true",
  );
  await expect(catalog).toHaveAttribute("data-ztm-light-surface", "true");
  await expect(catalog).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(card).toHaveCSS("color", "rgb(17, 24, 39)");
  await expect(page.getByRole("button", { name: "Open course" })).toHaveCSS(
    "color",
    "rgb(255, 255, 255)",
  );
  await expect(page.getByAltText("course artwork")).not.toHaveAttribute(
    "data-ztm-light-surface",
    "true",
  );
});

test("logged-out Academy and Teachable SSO pages are not modified", async ({
  page,
}) => {
  for (const url of [
    "https://academy.zerotomastery.io/sign_in",
    "https://sso.teachable.com/secure/123/identity/login/password",
  ]) {
    await page.goto(url);
    await page.evaluate(() => {
      document.body.innerHTML = `
        <main style="background: white; color: #172033">
          <form style="background: #f1f3f5">
            <label>Email</label>
            <input style="background: white; color: #111827">
            <button style="background: rgb(245, 0, 87); color: white">Log in</button>
          </form>
        </main>`;
    });

    await expect(page.locator("html")).not.toHaveAttribute("data-theme");
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    await expect(page.locator("form")).toHaveCSS(
      "background-color",
      "rgb(241, 243, 245)",
    );
    await expect(page.locator("input")).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)",
    );
    await expect(page.getByRole("button", { name: "Log in" })).toHaveCSS(
      "background-color",
      "rgb(245, 0, 87)",
    );
  }
});

test("Academy cannot restore an active home link after its SPA rerenders", async ({
  page,
}) => {
  await page.evaluate((markup) => {
    document.body.innerHTML = markup;
  }, lessonHeader);

  const link = page.getByAltText("school logo").locator("xpath=ancestor::a");
  await expect(link).not.toHaveAttribute("href", "/");
  await expect(link).toHaveAttribute("data-ztm-fullscreen-exit", "true");
});

test("the curriculum back control exits fullscreen instead of changing routes", async ({
  page,
}) => {
  await page.evaluate(() => {
    document.body.innerHTML = `
      <a class="nav-icon-back" aria-label="Back to course curriculum"
         data-no-turbolink="true" role="button" href="/courses/697434">
        <svg width="25" height="21"><path fill="white"></path></svg>
      </a>`;
  });

  const back = page.getByRole("button", { name: "Back to course curriculum" });
  await expect(back).not.toHaveAttribute("href", "/courses/697434");
  await expect(back).toHaveAttribute("data-ztm-fullscreen-exit", "true");
  await back.click();

  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          globalThis as typeof globalThis & {
            __ZTM_DESKTOP_CALLS__: Array<{
              command: string;
              args: { fullscreen: boolean };
            }>;
          }
        ).__ZTM_DESKTOP_CALLS__.at(-1),
      ),
    )
    .toMatchObject({
      command: "web_view_fullscreen",
      args: { fullscreen: false },
    });
  await expect(page).toHaveURL(
    "https://academy.zerotomastery.io/lessons/current-lesson",
  );
});
