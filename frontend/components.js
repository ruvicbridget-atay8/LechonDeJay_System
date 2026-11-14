
// components.js
// Person B - Shared UI Kit
// Reusable components for tables, pop-ups, status chips, and empty states.

// ---------- HTML ESCAPING ----------
export function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

// ---------- STATUS CHIPS ----------
export function statusChip(status) {
  const normalized = String(status ?? "").toLowerCase();

  const statusClass = {
    completed: "success",
    available: "success",
    approved: "success",
    voided: "danger",
    unavailable: "danger",
    rejected: "danger",
    refunded: "info",
    pending: "warning",
    archived: "muted",
  };

  const color = statusClass[normalized] || "muted";

  return `
    <span class="status-chip status-${color}">
      ${escapeHTML(status || "Unknown")}
    </span>
  `;
}

// ---------- EMPTY STATE ----------
export function emptyState(message = "No records matched") {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">
        <i class="bi bi-inbox"></i>
      </div>
      <h3>No records found</h3>
      <p>${escapeHTML(message)}</p>
    </div>
  `;
}

// ---------- REUSABLE POP-UP ----------
export function openModal({
  title = "Details",
  content = "",
  size = "medium",
  onClose = null,
} = {}) {
  // Close any existing modal.
  document.querySelector(".shared-modal-overlay")?.remove();

  // Remember the element that opened the modal.
  const previouslyFocusedElement = document.activeElement;

  const overlay = document.createElement("div");
  overlay.className = "shared-modal-overlay";

  overlay.innerHTML = `
    <div class="shared-modal shared-modal-${escapeHTML(size)}"
         role="dialog"
         aria-modal="true"
         aria-labelledby="shared-modal-title"
         tabindex="-1">

      <div class="shared-modal-header">
        <h2 id="shared-modal-title">${escapeHTML(title)}</h2>

        <button class="icon-btn modal-close"
                type="button"
                aria-label="Close dialog">
          <i class="bi bi-x-lg" aria-hidden="true"></i>
        </button>
      </div>

      <div class="shared-modal-body">
        ${content}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const modal = overlay.querySelector(".shared-modal");
  const closeButton = overlay.querySelector(".modal-close");

  let isClosed = false;

  function close() {
    if (isClosed) return;

    isClosed = true;

    overlay.remove();
    document.removeEventListener("keydown", handleKeydown);

    // Restore focus to the element that opened the modal.
    if (previouslyFocusedElement?.isConnected) {
      previouslyFocusedElement.focus();
    }

    onClose?.();
  }

  // ---------- KEYBOARD ACCESSIBILITY ----------
  function handleKeydown(event) {
    // Close modal using Escape.
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }

    // Keep keyboard focus inside the modal.
    if (event.key === "Tab") {
      const focusableElements = modal.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), ' +
        'select:not([disabled]), textarea:not([disabled]), ' +
        '[tabindex]:not([tabindex="-1"])'
      );

      const elements = Array.from(focusableElements).filter(
        (element) => element.getClientRects().length > 0
      );

      const firstElement = elements[0];
      const lastElement = elements[elements.length - 1];

      if (!firstElement || !lastElement) {
        event.preventDefault();
        modal.focus();
        return;
      }

      if (
        event.shiftKey &&
        (document.activeElement === firstElement ||
         !modal.contains(document.activeElement))
      ) {
        event.preventDefault();
        lastElement.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === lastElement
      ) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  }

  // Close button.
  closeButton.addEventListener("click", close);

  // Close when clicking outside the modal.
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      close();
    }
  });

  document.addEventListener("keydown", handleKeydown);

  // Set initial keyboard focus.
  closeButton.focus();

  return {
    close,
    element: overlay,
  };
}

// ---------- REUSABLE TABLE ----------
export function renderTable(container, {
  columns = [],
  data = [],
  searchKeys = [],
  filters = [],
  pageSize = 8,
  emptyMessage = "No records matched your search.",
  onRowClick = null,
} = {}) {

  // ---------- PAGE SIZE VALIDATION ----------
  const safePageSize =
    Number.isInteger(Number(pageSize)) && Number(pageSize) > 0
      ? Number(pageSize)
      : 8;

  let search = "";
  let activeFilter = "all";
  let currentPage = 1;

  container.innerHTML = `
    <div class="shared-table">

      <div class="table-toolbar">
        <div class="table-search">
          <i class="bi bi-search" aria-hidden="true"></i>
          <input type="search"
                 class="table-search-input"
                 placeholder="Search records..."
                 aria-label="Search records">
        </div>

        <div class="table-filters">
          <button type="button"
                  class="filter-chip is-active"
                  data-filter="all"
                  aria-pressed="true">
            All
          </button>

          ${filters.map((filter) => `
            <button type="button"
                    class="filter-chip"
                    data-filter="${escapeHTML(filter.value)}"
                    aria-pressed="false">
              ${escapeHTML(filter.label)}
            </button>
          `).join("")}
        </div>
      </div>

      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              ${columns.map((column) => `
                <th scope="col">${escapeHTML(column.label)}</th>
              `).join("")}
            </tr>
          </thead>

          <tbody class="table-body"></tbody>
        </table>
      </div>

      <div class="table-footer">
        <span class="table-count" aria-live="polite"></span>

        <div class="table-pagination">
          <button class="page-btn page-prev"
                  type="button"
                  aria-label="Previous page">
            <i class="bi bi-chevron-left" aria-hidden="true"></i>
          </button>

          <span class="page-number" aria-live="polite"></span>

          <button class="page-btn page-next"
                  type="button"
                  aria-label="Next page">
            <i class="bi bi-chevron-right" aria-hidden="true"></i>
          </button>
        </div>
      </div>

    </div>
  `;

  const searchInput = container.querySelector(".table-search-input");
  const tbody = container.querySelector(".table-body");
  const filterButtons = container.querySelectorAll(".filter-chip");
  const count = container.querySelector(".table-count");
  const pageNumber = container.querySelector(".page-number");
  const previousButton = container.querySelector(".page-prev");
  const nextButton = container.querySelector(".page-next");

  // ---------- FILTER DATA ----------
  function getFilteredData() {
    return data.filter((row) => {
      const matchesSearch = !search ||
        searchKeys.some((key) =>
          String(row[key] ?? "")
            .toLowerCase()
            .includes(search)
        );

      const selectedFilter = filters.find(
        (filter) => String(filter.value) === activeFilter
      );

      const matchesFilter =
        activeFilter === "all" ||
        !selectedFilter ||
        selectedFilter.predicate(row);

      return matchesSearch && matchesFilter;
    });
  }

  // ---------- RENDER TABLE ----------
  function render() {
    const filtered = getFilteredData();

    const totalPages = Math.max(
      1,
      Math.ceil(filtered.length / safePageSize)
    );

    // Keep current page within valid limits.
    currentPage = Math.min(
      Math.max(1, currentPage),
      totalPages
    );

    const start = (currentPage - 1) * safePageSize;

    const visibleRows = filtered.slice(
      start,
      start + safePageSize
    );

    if (!visibleRows.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="${Math.max(columns.length, 1)}">
            ${emptyState(emptyMessage)}
          </td>
        </tr>
      `;
    } else {
      tbody.innerHTML = visibleRows.map((row) => `
        <tr class="${onRowClick ? "clickable-row" : ""}"
            ${onRowClick ? 'tabindex="0"' : ""}>
          ${columns.map((column) => {
            const value = column.render
              ? column.render(row)
              : escapeHTML(row[column.key] ?? "—");

            return `<td>${value}</td>`;
          }).join("")}
        </tr>
      `).join("");

      if (onRowClick) {
        tbody.querySelectorAll("tr").forEach((tr, index) => {

          const handleRowClick = () => {
            onRowClick(visibleRows[index]);
          };

          tr.addEventListener("click", handleRowClick);

          tr.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              handleRowClick();
            }
          });
        });
      }
    }

    // Update record count.
    count.textContent =
      `Showing ${filtered.length ? start + 1 : 0}–${start + visibleRows.length} of ${filtered.length} records`;

    // Update pagination.
    pageNumber.textContent =
      `${currentPage} / ${totalPages}`;

    previousButton.disabled = currentPage <= 1;
    nextButton.disabled = currentPage >= totalPages;
  }

  // ---------- SEARCH ----------
  searchInput.addEventListener("input", (event) => {
    search = event.target.value.toLowerCase().trim();
    currentPage = 1;
    render();
  });

  // ---------- FILTER BUTTONS ----------
  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      currentPage = 1;

      filterButtons.forEach((item) => {
        const isActive = item === button;

        item.classList.toggle("is-active", isActive);
        item.setAttribute("aria-pressed", String(isActive));
      });

      render();
    });
  });

  // ---------- PREVIOUS PAGE ----------
  previousButton.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      render();
    }
  });

  // ---------- NEXT PAGE ----------
  nextButton.addEventListener("click", () => {
    const totalPages = Math.max(
      1,
      Math.ceil(getFilteredData().length / safePageSize)
    );

    if (currentPage < totalPages) {
      currentPage++;
      render();
    }
  });

  // Initial rendering.
  render();

  // ---------- RETURN TABLE METHODS ----------
  return {
    refresh() {
      render();
    },

    setData(newData) {
      data = Array.isArray(newData) ? newData : [];
      currentPage = 1;
      render();
    },
  };
}
