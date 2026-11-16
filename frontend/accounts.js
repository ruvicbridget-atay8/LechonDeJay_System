// accounts.js: Admin account management page.

import * as api from "./api.js";
import { escapeHTML, openModal } from "./components.js";

// ---------- CUSTOM ACCOUNT NOTICE ----------
function showAccountNotice(title, message, type = "success") {
  const isError = type === "error";

  const modal = openModal({
    title,
    size: "small",
    content: `
      <div style="text-align:center; padding:0.5rem 0;">
        <div style="
          width:48px;
          height:48px;
          border-radius:50%;
          margin:0 auto 12px;
          display:flex;
          align-items:center;
          justify-content:center;
          background:${isError ? "#fde9e6" : "#e5f7ed"};
          color:${isError ? "#b42318" : "#16834b"};
          font-size:22px;
        ">
          <i class="bi ${isError ? "bi-exclamation-circle" : "bi-check-circle"}"></i>
        </div>

        <p style="color:#475467; margin:0;">
          ${escapeHTML(message)}
        </p>

        <div style="display:flex; justify-content:center; margin-top:20px;">
          <button type="button" class="btn btn--primary" id="account-notice-ok">
            OK
          </button>
        </div>
      </div>
    `,
  });

  modal.element
    .querySelector("#account-notice-ok")
    .addEventListener("click", () => modal.close());
}

// ---------- CUSTOM ACCOUNT CONFIRMATION ----------
function showAccountConfirmation(title, message, confirmLabel, onConfirm) {
  const modal = openModal({
    title,
    size: "small",
    content: `
      <div style="padding:0.5rem 0;">
        <p style="color:#475467; margin:0 0 20px;">
          ${escapeHTML(message)}
        </p>

        <p
          id="account-confirm-error"
          role="alert"
          style="color:#b42318; font-size:13px; margin-bottom:12px;"
          hidden
        ></p>

        <div style="display:flex; justify-content:flex-end; gap:10px; flex-wrap:wrap;">
          <button type="button" class="btn btn--soft" id="account-confirm-cancel">
            Cancel
          </button>

          <button type="button" class="btn btn--primary" id="account-confirm-action">
            ${escapeHTML(confirmLabel)}
          </button>
        </div>
      </div>
    `,
  });

  const confirmButton = modal.element.querySelector("#account-confirm-action");

  const cancelButton = modal.element.querySelector("#account-confirm-cancel");

  const errorMessage = modal.element.querySelector("#account-confirm-error");

  cancelButton.addEventListener("click", () => modal.close());

  confirmButton.addEventListener("click", async () => {
    try {
      confirmButton.disabled = true;
      confirmButton.textContent = "Please wait...";

      await onConfirm();

      modal.close();
    } catch (error) {
      errorMessage.textContent =
        error.message || "Unable to update account status.";

      errorMessage.hidden = false;

      confirmButton.disabled = false;
      confirmButton.textContent = confirmLabel;
    }
  });
}

// ---------- RENDER ACCOUNTS ----------
export function renderAccounts(container, currentUser) {
  container.innerHTML = `
    <div class="accounts-page">

      <div class="accounts-page-header">
        <div class="accounts-heading">
          <h1>Accounts</h1>
          <p class="muted">Manage system users and their account access.</p>
        </div>

        <button class="btn btn--primary accounts-add-btn" id="add-account-btn" type="button">
          <i class="bi bi-plus-lg"></i>
          <span>Add Account</span>
        </button>
      </div>

      <div class="accounts-toolbar">
        <input
          type="search"
          id="account-search"
          class="input accounts-search"
          placeholder="Search by name, username, or role..."
          aria-label="Search accounts"
        />
      </div>

            <section class="accounts-section">
        <h2 class="accounts-section-title">
          Active Accounts <span class="accounts-count" id="active-count"></span>
        </h2>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Full Name</th>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="active-accounts-body"></tbody>
          </table>
        </div>
      </section>

      <section class="accounts-section">
        <h2 class="accounts-section-title">
          Deactivated Accounts <span class="accounts-count" id="inactive-count"></span>
        </h2>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Full Name</th>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="inactive-accounts-body"></tbody>
          </table>
        </div>
      </section>

    </div>
  `;

  const activeBody = container.querySelector("#active-accounts-body");
  const inactiveBody = container.querySelector("#inactive-accounts-body");
  const searchInput = container.querySelector("#account-search");

  // ---------- LOAD ACCOUNTS ----------
  async function loadAccounts() {
    try {
      const users = await api.getUsers();
      displayAccounts(users, searchInput.value);
    } catch (error) {
      console.error("Unable to load accounts:", error);

      tableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center;padding:25px;">
            Unable to load accounts.
          </td>
        </tr>
      `;
    }
  }

  // ---------- DISPLAY ACCOUNTS ----------
  function accountRow(user) {
    const isCurrentUser =
      currentUser && String(currentUser.id) === String(user.id);

    return `
      <tr>
        <td><strong>${escapeHTML(user.name)}</strong></td>
        <td>${escapeHTML(user.username)}</td>
        <td>${escapeHTML(user.role)}</td>
        <td>
          <span class="status-chip ${user.active ? "status-active" : "status-inactive"}">
            ${user.active ? "Active" : "Deactivated"}
          </span>
        </td>
        <td>
          <div class="account-action-buttons">
            <button
              class="btn btn--soft edit-account-btn"
              data-id="${escapeHTML(user.id)}"
              type="button"
            >
              <i class="bi bi-pencil"></i>
              Edit
            </button>

            <button
              class="btn ${user.active ? "btn--soft" : "btn--primary"} toggle-account-btn"
              data-id="${escapeHTML(user.id)}"
              type="button"
              ${isCurrentUser ? "disabled title='You cannot deactivate your own account.'" : ""}
            >
              ${user.active ? "Deactivate" : "Activate"}
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  function fillTable(body, users, emptyText) {
    body.innerHTML = users.length
      ? users.map(accountRow).join("")
      : `
        <tr>
          <td colspan="5" style="text-align:center;padding:25px;">
            ${emptyText}
          </td>
        </tr>
      `;
  }

  function displayAccounts(users, searchTerm = "") {
    const term = searchTerm.toLowerCase().trim();

    const filteredUsers = users.filter((user) => {
      return (
        String(user.name || "")
          .toLowerCase()
          .includes(term) ||
        String(user.username || "")
          .toLowerCase()
          .includes(term) ||
        String(user.role || "")
          .toLowerCase()
          .includes(term)
      );
    });

    const active = filteredUsers.filter((user) => user.active);
    const inactive = filteredUsers.filter((user) => !user.active);

    fillTable(
      activeBody,
      active,
      term ? "No active accounts match your search." : "No active accounts.",
    );

    fillTable(
      inactiveBody,
      inactive,
      term
        ? "No deactivated accounts match your search."
        : "No deactivated accounts.",
    );

    container.querySelector("#active-count").textContent = active.length;
    container.querySelector("#inactive-count").textContent = inactive.length;
  }

  // ---------- SEARCH ----------
  searchInput.addEventListener("input", loadAccounts);

  // ---------- ADD ACCOUNT ----------
  container.querySelector("#add-account-btn").addEventListener("click", () => {
    showAccountForm();
  });

  // ---------- TABLE ACTIONS ----------
  container
    .querySelector(".accounts-page")
    .addEventListener("click", async (event) => {
      const target =
        event.target instanceof Element
          ? event.target
          : event.target.parentElement;

      if (!target) return;

      const editButton = target.closest(".edit-account-btn");
      const toggleButton = target.closest(".toggle-account-btn");

      // EDIT ACCOUNT
      if (editButton) {
        try {
          const users = await api.getUsers();

          const user = users.find(
            (item) => String(item.id) === editButton.dataset.id,
          );

          if (user) {
            showAccountForm(user);
          } else {
            showAccountNotice(
              "Account Not Found",
              "The selected account could not be found.",
              "error",
            );
          }
        } catch (error) {
          showAccountNotice(
            "Unable to Open Account",
            error.message || "Unable to retrieve account information.",
            "error",
          );
        }

        return;
      }

      // ACTIVATE / DEACTIVATE ACCOUNT
      if (toggleButton) {
        try {
          const users = await api.getUsers();

          const user = users.find(
            (item) => String(item.id) === toggleButton.dataset.id,
          );

          if (!user) {
            showAccountNotice(
              "Account Not Found",
              "The selected account could not be found.",
              "error",
            );
            return;
          }

          // Prevent changing the current user's own account.
          if (currentUser && String(currentUser.id) === String(user.id)) {
            showAccountNotice(
              "Action Not Allowed",
              "You cannot deactivate your own account.",
              "error",
            );
            return;
          }

          const action = user.active ? "deactivate" : "activate";
          const newStatus = !user.active;

          showAccountConfirmation(
            `${user.active ? "Deactivate" : "Activate"} Account`,
            `Are you sure you want to ${action} ${user.name}'s account?`,
            user.active ? "Deactivate" : "Activate",
            async () => {
              await api.updateUserStatus(user.id, newStatus);

              await loadAccounts();

              showAccountNotice(
                "Account Updated",
                `${user.name}'s account has been ${newStatus ? "activated" : "deactivated"} successfully.`,
              );
            },
          );
        } catch (error) {
          showAccountNotice(
            "Unable to Update Account",
            error.message || "Unable to retrieve account information.",
            "error",
          );
        }
      }
    });

  // ---------- ACCOUNT FORM ----------
  function showAccountForm(user = null) {
    const editing = Boolean(user);

    const modal = document.createElement("div");
    modal.className = "shared-modal-overlay";

    modal.innerHTML = `
      <div class="shared-modal shared-modal-medium"
           role="dialog"
           aria-modal="true"
           aria-labelledby="account-modal-title">

        <div class="shared-modal-header">
          <div>
            <h2 id="account-modal-title">
              ${editing ? "Edit Account" : "Create New Account"}
            </h2>

            <p style="margin-top:5px;color:#667085;font-size:13px;">
              ${
                editing
                  ? "Update the account information below."
                  : "Fill in the details to register a new user."
              }
            </p>
          </div>

          <button
            type="button"
            class="modal-close"
            id="close-account-form"
            aria-label="Close"
          >
            <i class="bi bi-x-lg"></i>
          </button>
        </div>

        <form id="account-form">
          <div class="shared-modal-body">

            <p
              id="account-form-error"
              role="alert"
              style="
                display:none;
                color:#b42318;
                background:#fde9e6;
                border:1px solid #f0b8b3;
                border-radius:8px;
                padding:10px 12px;
                font-size:13px;
                margin-bottom:15px;
              "
            ></p>

            <div class="account-form-section">
              <h3>Personal Information</h3>

              <div class="account-form-group">
                <label for="account-name">Full Name</label>
                <input
                  id="account-name"
                  name="name"
                  class="form-control"
                  type="text"
                  placeholder="Enter full name"
                  value="${escapeHTML(user?.name || "")}"
                  required
                />
              </div>

              <div class="account-form-group">
                <label for="account-username">Username</label>
                <input
                  id="account-username"
                  name="username"
                  class="form-control"
                  type="text"
                  placeholder="Enter username"
                  value="${escapeHTML(user?.username || "")}"
                  required
                />
              </div>
            </div>

            <div class="account-form-section">
              <h3>Account Security</h3>

              <div class="account-form-group">
                <label for="account-password">Password</label>
                <input
                  id="account-password"
                  name="password"
                  class="form-control"
                  type="password"
                  placeholder="${
                    editing
                      ? "Leave blank to keep current password"
                      : "Enter password"
                  }"
                  ${editing ? "" : "required"}
                />

                ${
                  editing
                    ? `<small>Leave blank if you do not want to change the password.</small>`
                    : ""
                }
              </div>

              <div class="account-form-group">
                <label for="account-role">Account Role</label>
                <select
                  id="account-role"
                  name="role"
                  class="form-control"
                  required
                >
                  <option value="Cashier" ${user?.role === "Cashier" ? "selected" : ""}>
                    Cashier
                  </option>

                  <option value="Admin" ${user?.role === "Admin" ? "selected" : ""}>
                    Admin
                  </option>
                </select>
              </div>
            </div>

          </div>

          <div class="account-form-footer">
            <button
              type="button"
              class="btn btn--soft"
              id="cancel-account"
            >
              Cancel
            </button>

            <button
              type="submit"
              class="btn btn--primary"
              id="save-account-btn"
            >
              <i class="bi bi-check-lg"></i>
              ${editing ? "Save Changes" : "Create Account"}
            </button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();

    const form = modal.querySelector("#account-form");
    const errorMessage = modal.querySelector("#account-form-error");
    const saveButton = modal.querySelector("#save-account-btn");

    modal
      .querySelector("#close-account-form")
      .addEventListener("click", closeModal);

    modal
      .querySelector("#cancel-account")
      .addEventListener("click", closeModal);

    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal();
    });

    // ---------- SAVE ACCOUNT ----------
    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      errorMessage.style.display = "none";
      errorMessage.textContent = "";

      if (!form.reportValidity()) return;

      const formData = new FormData(form);

      const data = {
        name: String(formData.get("name") || "").trim(),
        username: String(formData.get("username") || "").trim(),
        password: formData.get("password"),
        role: formData.get("role"),
      };

      try {
        saveButton.disabled = true;
        saveButton.textContent = "Saving...";

        if (editing) {
          await api.updateUser(user.id, data);
        } else {
          await api.addUser(data);
        }

        closeModal();

        await loadAccounts();

        showAccountNotice(
          editing ? "Account Updated" : "Account Created",
          editing
            ? "The account information has been updated successfully."
            : "The new account has been created successfully.",
        );
      } catch (error) {
        // Keep the form open and preserve entered values.
        errorMessage.textContent = error.message || "Unable to save account.";

        errorMessage.style.display = "block";

        saveButton.disabled = false;
        saveButton.innerHTML = `
          <i class="bi bi-check-lg"></i>
          ${editing ? "Save Changes" : "Create Account"}
        `;
      }
    });

    modal.querySelector("#account-name").focus();
  }

  loadAccounts();
}
