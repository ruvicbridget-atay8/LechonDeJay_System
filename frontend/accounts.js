
// accounts.js: Admin account management page.

import * as api from "./api.js";
import { escapeHTML } from "./components.js";

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
          <tbody id="accounts-table-body"></tbody>
        </table>
      </div>

    </div>
  `;

  const tableBody = container.querySelector("#accounts-table-body");
  const searchInput = container.querySelector("#account-search");

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

  function displayAccounts(users, searchTerm = "") {
    const term = searchTerm.toLowerCase().trim();

    const filteredUsers = users.filter((user) => {
      return (
        String(user.name || "").toLowerCase().includes(term) ||
        String(user.username || "").toLowerCase().includes(term) ||
        String(user.role || "").toLowerCase().includes(term) ||
        (user.active ? "active" : "inactive").includes(term)
      );
    });

    if (!filteredUsers.length) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center;padding:25px;">
            No accounts found.
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = filteredUsers.map((user) => {
      const isCurrentUser =
        currentUser && String(currentUser.id) === String(user.id);

      return `
        <tr>
          <td><strong>${escapeHTML(user.name)}</strong></td>
          <td>${escapeHTML(user.username)}</td>
          <td>${escapeHTML(user.role)}</td>
          <td>
            <span class="status-chip ${user.active ? "status-active" : "status-inactive"}">
              ${user.active ? "Active" : "Inactive"}
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
    }).join("");
  }

  searchInput.addEventListener("input", loadAccounts);

  container.querySelector("#add-account-btn").addEventListener("click", () => {
    showAccountForm();
  });

  tableBody.addEventListener("click", async (event) => {
    const editButton = event.target.closest(".edit-account-btn");
    const toggleButton = event.target.closest(".toggle-account-btn");

    if (editButton) {
      const users = await api.getUsers();

      const user = users.find(
        (item) => String(item.id) === editButton.dataset.id
      );

      if (user) showAccountForm(user);
    }

    if (toggleButton) {
      const users = await api.getUsers();

      const user = users.find(
        (item) => String(item.id) === toggleButton.dataset.id
      );

      if (!user) return;

      if (
        currentUser &&
        String(currentUser.id) === String(user.id)
      ) {
        alert("You cannot deactivate your own account.");
        return;
      }

      const action = user.active ? "deactivate" : "activate";

      if (!confirm(`Are you sure you want to ${action} ${user.name}'s account?`)) {
        return;
      }

      try {
        await api.updateUserStatus(user.id, !user.active);
        await loadAccounts();
      } catch (error) {
        alert(error.message || "Unable to update account status.");
      }
    }
  });

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
              ${editing
                ? "Update the account information below."
                : "Fill in the details to register a new user."}
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
                  placeholder="${editing
                    ? "Leave blank to keep current password"
                    : "Enter password"}"
                  ${editing ? "" : "required"}
                />

                ${editing
                  ? `<small>Leave blank if you do not want to change the password.</small>`
                  : ""}
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

            <button type="submit" class="btn btn--primary">
              <i class="bi bi-check-lg"></i>
              ${editing ? "Save Changes" : "Create Account"}
            </button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();

    modal.querySelector("#close-account-form")
      .addEventListener("click", closeModal);

    modal.querySelector("#cancel-account")
      .addEventListener("click", closeModal);

    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal();
    });

    modal.querySelector("#account-form")
      .addEventListener("submit", async (event) => {
        event.preventDefault();

        const formData = new FormData(event.target);

        const data = {
          name: formData.get("name").trim(),
          username: formData.get("username").trim(),
          password: formData.get("password"),
          role: formData.get("role"),
        };

        try {
          if (editing) {
            await api.updateUser(user.id, data);
          } else {
            await api.addUser(data);
          }

          closeModal();
          await loadAccounts();

          alert(
            editing
              ? "Account updated successfully."
              : "Account created successfully."
          );
        } catch (error) {
          alert(error.message || "Unable to save account.");
        }
      });

    modal.querySelector("#account-name").focus();
  }

  loadAccounts();
}
