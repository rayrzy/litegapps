"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { login } from "@/lib/session";
import { clientKey, lockedFor, recordFailure, recordSuccess, userKey } from "@/lib/loginlimit";

export async function loginAction(formData: FormData) {
	const username = String(formData.get("username") ?? "").trim();
	const password = String(formData.get("password") ?? "");

	if (!username || !password) redirect("/login?error=empty");

	const h = await headers();
	const keys = [clientKey(h.get("x-forwarded-for")), userKey(username)];

	// Refuse before touching the database or running scrypt, so a locked-out
	// client cannot use the form to burn CPU either.
	if (lockedFor(keys) > 0) redirect("/login?error=locked");

	if (!(await login(username, password))) {
		recordFailure(keys);
		redirect("/login?error=invalid");
	}

	recordSuccess(keys);
	redirect("/");
}
