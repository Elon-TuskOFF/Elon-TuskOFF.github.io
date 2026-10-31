const STORAGE_PREFIX = "polytechnic-comments:v1:";
const MAX_AUTHOR_LENGTH = 60;
const MAX_COMMENT_LENGTH = 1000;

function isValidComment(comment) {
  return comment && typeof comment.author === "string"
    && comment.author.trim().length > 0 && comment.author.length <= MAX_AUTHOR_LENGTH
    && typeof comment.text === "string" && comment.text.trim().length > 0
    && comment.text.length <= MAX_COMMENT_LENGTH
    && typeof comment.createdAt === "string" && Number.isFinite(Date.parse(comment.createdAt));
}

function readComments(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(saved) ? saved.filter(isValidComment) : [];
  } catch {
    // Storage can be blocked or contain invalid data; the form still works in memory.
    return [];
  }
}

/** Each server has its own local list. User text is never interpreted as HTML. */
export function initializeComments() {
  for (const panel of document.querySelectorAll("[data-comments]")) {
    const storageKey = STORAGE_PREFIX + panel.dataset.comments;
    const comments = readComments(storageKey);
    const form = panel.querySelector("[data-comment-form]");
    const authorInput = form.elements.namedItem("author");
    const commentInput = form.elements.namedItem("comment");
    const list = panel.querySelector("[data-comment-list]");
    const emptyMessage = panel.querySelector("[data-empty-comments]");
    const message = panel.querySelector("[data-comment-message]");
    const count = panel.querySelector("[data-comment-count]");

    function renderComments() {
      const fragment = document.createDocumentFragment();
      for (const comment of comments) {
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
        fragment.append(item);
      }
      list.replaceChildren(fragment);
      count.textContent = String(comments.length);
      emptyMessage.hidden = comments.length > 0;
    }

    form.noValidate = true;
    form.querySelector("fieldset").disabled = false;
    renderComments();

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      message.textContent = "";
      authorInput.removeAttribute("aria-invalid");
      commentInput.removeAttribute("aria-invalid");

      const author = authorInput.value.trim();
      const text = commentInput.value.trim();
      const invalidInput = !author || author.length > MAX_AUTHOR_LENGTH ? authorInput
        : !text || text.length > MAX_COMMENT_LENGTH ? commentInput : null;
      if (invalidInput) {
        message.textContent = invalidInput === authorInput
          ? "Вкажіть ім’я — від 1 до 60 символів."
          : "Напишіть коментар — від 1 до 1000 символів.";
        invalidInput.setAttribute("aria-invalid", "true");
        invalidInput.focus();
        return;
      }

      comments.push({ author, text, createdAt: new Date().toISOString() });
      renderComments();
      form.reset();
      authorInput.focus();

      try {
        localStorage.setItem(storageKey, JSON.stringify(comments));
        message.textContent = "Коментар додано. Його видно лише у цьому браузері.";
      } catch {
        message.textContent = "Коментар додано на цій сторінці. Браузер не дозволив зберегти його після оновлення.";
      }
    });
  }
}
