// The two values to set before this page goes live. Nothing else needs to change.
//
// FORM_ENDPOINT, one of:
//   - a Formspree form URL, https://formspree.io/f/<id>: the page posts its own fields there and shows the thank-you line
//     (field names: business_name, segment, workers, city, contact_method, contact, and audience = business | moaqqib;
//     _gotcha is the spam trap);
//   - a hosted Google Forms or Tally link (https://docs.google.com/forms/..., https://forms.gle/..., https://tally.so/...):
//     the page hides its own fields and shows one button that opens that form.
//   Left empty, the button says registration opens soon and offers the support email below.
//   Any other provider also needs its origin added to connect-src in index.html's Content-Security-Policy.
//
// SUPPORT_EMAIL: the factory's public support address. The mailto link appears only once this is a real address.
window.SALAHIYA_BUSINESS = {
  FORM_ENDPOINT: '',
  SUPPORT_EMAIL: '{SUPPORT_EMAIL}',
};
