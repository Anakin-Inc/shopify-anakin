import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Anakin market research, inside Shopify</h1>
        <p className={styles.text}>
          Scrape a competitor&rsquo;s product page or run AI-powered market
          research without leaving your Shopify admin.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Scrape a URL</strong>. Pull a competitor&rsquo;s product
            page as clean markdown, via Anakin&rsquo;s{" "}
            <code>url-scraper</code> job.
          </li>
          <li>
            <strong>AI search</strong>. Ask a question, get back ranked,
            summarized web results in seconds.
          </li>
          <li>
            <strong>Agentic research</strong>. Hand off a multi-step research
            question and get back an AI-written summary.
          </li>
        </ul>
      </div>
    </div>
  );
}
