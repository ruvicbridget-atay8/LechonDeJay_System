// password-toggle.js: eye icon that hides or shows a password field.

export function addPasswordToggle(input) {
  if (!input || input.dataset.hasToggle) return;
  input.dataset.hasToggle = "true";

  const wrap = document.createElement("div");
  wrap.className = "password-field";
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "password-toggle";
  wrap.appendChild(button);

  function draw() {
    const hidden = input.type === "password";
    button.innerHTML = `<i class="bi ${hidden ? "bi-eye" : "bi-eye-slash"}" aria-hidden="true"></i>`;
    button.setAttribute(
      "aria-label",
      hidden ? "Show password" : "Hide password",
    );
    button.setAttribute("aria-pressed", String(!hidden));
  }

  button.addEventListener("click", () => {
    input.type = input.type === "password" ? "text" : "password";
    draw();
    input.focus();
  });

  draw();
}
