// GitHub Pages serves static files; its comments use the existing Cloudflare API.
const API_URL = location.hostname === "elon-tuskoff.github.io"
  ? "https://elon-tuskoff-github-io.gandrij549.workers.dev/api/comments"
  : "/api/comments";

class CommentsError extends Error {}

async function requestComments(url, options = {}) {
  try {
    const response = await fetch(url, { cache: "no-store", ...options });
    const data = await response.json();
    if (!response.ok) {
      const error = new CommentsError(data.error || "Не вдалося завантажити коментарі.");
      error.nextAllowedAt = data.nextAllowedAt;
      throw error;
    }
    return data;
  } catch (error) {
    if (error instanceof CommentsError) throw error;
    throw new CommentsError("Коментарі тимчасово недоступні. Натисніть «Оновити», щоб спробувати ще раз.");
  }
}

function commentElement(comment) {
  const item = document.createElement("li");
  item.className = "rounded-xl border border-white/10 bg-page/40 p-4";
  const author = document.createElement("p");
  author.className = "break-words text-sm font-semibold text-white";
  author.textContent = comment.author;
  const date = document.createElement("time");
  date.className = "mt-1 block text-[10px] text-muted";
  date.dateTime = comment.createdAt;
  date.textContent = new Date(comment.createdAt).toLocaleString("uk-UA", {
    day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  });
  const text = document.createElement("p");
  text.className = "mt-3 break-words whitespace-pre-wrap text-sm leading-6 text-copy";
  text.textContent = comment.text;
  item.append(author, date, text);
  return item;
}

/** Comments and the posting allowance come from the server, never localStorage. */
export function initializeComments() {
  const views = [];
  let nextAllowedAt = 0;
  let expiryTimer;
  let posting = false;

  function updatePostingState() {
    const remaining = nextAllowedAt - Date.now();
    for (const view of views) {
      view.submit.disabled = !view.ready || view.loading || posting || remaining > 0;
      view.submit.textContent = posting ? "Публікуємо…" : "Додати коментар";
      view.postingStatus.textContent = remaining > 0
        ? `Наступний коментар можна опублікувати після ${new Date(nextAllowedAt).toLocaleString("uk-UA")}.`
        : "";
    }
    clearTimeout(expiryTimer);
    if (remaining > 0) expiryTimer = setTimeout(updatePostingState, remaining + 50);
  }

  function applyAllowance(value) {
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) nextAllowedAt = Math.max(nextAllowedAt, timestamp);
    updatePostingState();
  }

  for (const panel of document.querySelectorAll("[data-comments]")) {
    const form = panel.querySelector("[data-comment-form]");
    const view = {
      panel, form,
      server: panel.dataset.comments,
      author: form.elements.namedItem("author"),
      text: form.elements.namedItem("comment"),
      fieldset: form.querySelector("fieldset"),
      submit: form.querySelector("button[type=submit]"),
      list: panel.querySelector("[data-comment-list]"),
      empty: panel.querySelector("[data-empty-comments]"),
      count: panel.querySelector("[data-comment-count]"),
      message: panel.querySelector("[data-comment-message]"),
      postingStatus: panel.querySelector("[data-posting-status]"),
      refresh: panel.querySelector("[data-refresh-comments]"),
      more: panel.querySelector("[data-more-comments]"),
      comments: [], cursor: null, ready: false, loading: false,
    };
    views.push(view);
    form.noValidate = true;

    function render() {
      view.list.replaceChildren(...view.comments.map(commentElement));
      view.empty.hidden = view.comments.length > 0;
      view.more.hidden = view.cursor === null;
    }

    async function load(append = false) {
      if (view.loading) return;
      view.loading = true;
      updatePostingState();
      view.refresh.disabled = true;
      view.more.disabled = true;
      if (!view.comments.length) view.empty.textContent = "Завантаження коментарів…";
      try {
        const url = new URL(API_URL, location.origin);
        url.searchParams.set("server", view.server);
        if (append && view.cursor) url.searchParams.set("before", view.cursor);
        const data = await requestComments(url);
        view.comments = append
          ? [...new Map([...view.comments, ...data.comments].map(comment => [comment.id, comment])).values()]
          : data.comments;
        view.cursor = data.nextCursor;
        view.count.textContent = String(data.total);
        view.empty.textContent = "Коментарів поки немає. Почніть обговорення.";
        view.ready = true;
        view.fieldset.disabled = false;
        render();
        applyAllowance(data.nextAllowedAt);
      } catch (error) {
        view.message.textContent = error.message;
        if (!view.comments.length) view.empty.textContent = "Не вдалося завантажити коментарі.";
      } finally {
        view.loading = false;
        view.refresh.disabled = false;
        view.more.disabled = false;
        updatePostingState();
      }
    }

    view.refresh.addEventListener("click", () => { view.message.textContent = ""; load(); });
    view.more.addEventListener("click", () => load(true));
    panel.addEventListener("toggle", () => { if (panel.open) load(); });
    load();

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (posting || !view.ready || view.loading || nextAllowedAt > Date.now()) return;
      view.message.textContent = "";
      view.author.removeAttribute("aria-invalid");
      view.text.removeAttribute("aria-invalid");
      const author = view.author.value.trim();
      const text = view.text.value.trim();
      const invalid = !author || author.length > 60 ? view.author : !text || text.length > 1000 ? view.text : null;
      if (invalid) {
        view.message.textContent = invalid === view.author
          ? "Вкажіть ім’я — від 1 до 60 символів."
          : "Напишіть коментар — від 1 до 1000 символів.";
        invalid.setAttribute("aria-invalid", "true");
        invalid.focus();
        return;
      }

      posting = true;
      updatePostingState();
      try {
        const data = await requestComments(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ server: view.server, author, text }),
        });
        form.reset();
        applyAllowance(data.nextAllowedAt);
        view.message.textContent = "Коментар опубліковано. Його бачать усі відвідувачі.";
        await load();
      } catch (error) {
        applyAllowance(error.nextAllowedAt);
        view.message.textContent = error.message;
      } finally {
        posting = false;
        updatePostingState();
      }
    });
  }
}
