// The waitlist form. ENDPOINT is where entries are posted (a form service Igar signs up for).
// Until it is set, the form opens a prefilled email to Igar instead, so nobody is lost.
const ENDPOINT = "";
const TO = "Igar@mindscriber.com";

const form = document.getElementById("waitlist-form");
const note = document.getElementById("form-note");

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  if (data.website) return; // a bot filled the hidden field
  if (!form.email.checkValidity()) return (note.textContent = "Please enter your email.");
  if (!form.consent.checked) return (note.textContent = "Please tick the box so we can email you.");
  if (!ENDPOINT) {
    const body = `Name: ${data.name || ""}\nInterest: ${data.interest}\nCompany and role: ${data.company || ""}\nEmail: ${data.email}`;
    location.href = `mailto:${TO}?subject=${encodeURIComponent("Waitlist: " + (data.name || data.email))}&body=${encodeURIComponent(body)}`;
    note.textContent = "Your email app is opening. Send it and you're on the list.";
    return;
  }
  note.textContent = "Sending…";
  try {
    const r = await fetch(ENDPOINT, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (!r.ok) throw new Error(String(r.status));
    form.reset();
    note.textContent = "You're on the list.";
  } catch {
    note.textContent = `Something went wrong. Please email ${TO}.`;
  }
});
