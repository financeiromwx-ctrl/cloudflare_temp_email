import { Context } from "hono";

import { getBooleanValue, getJsonSetting } from "../utils";
import { sendMailToTelegram } from "../telegram_api";
import { auto_reply } from "./auto_reply";
import { isBlocked } from "./black_list";
import { triggerWebhook, triggerAnotherWorker, commonParseMail } from "../common";
import { check_if_junk_mail } from "./check_junk";
import { remove_attachment_if_need } from "./check_attachment";
import { extractEmailInfo } from "./ai_extract";
import { forwardEmail } from "./forward";
import { EmailRuleSettings } from "../models";
import { CONSTANTS } from "../constants";
import { compressText } from "../gzip";


async function email(message: ForwardableEmailMessage, env: Bindings, ctx: ExecutionContext) {
    if (await isBlocked(message.from, env)) {
        message.setReject("Reject from address");
        console.log(`Reject message from ${message.from} to ${message.to}`);
        return;
    }
    const rawEmail = await new Response(message.raw).text();
    const parsedEmailContext: ParsedEmailContext = {
        rawEmail: rawEmail
    };

    // check if junk mail
    try {
        const is_junk = await check_if_junk_mail(env, message.to, parsedEmailContext, message.headers.get("Message-ID"));
        if (is_junk) {
            message.setReject("Junk mail");
            console.log(`Junk mail from ${message.from} to ${message.to}`);
            return;
        }
    } catch (error) {
        console.error("check junk mail error", error);
    }

    // check if unknown address mail
    try {
        const emailRuleSettings = await getJsonSetting<EmailRuleSettings>(
            { env: env } as Context<HonoCustomType>, CONSTANTS.EMAIL_RULE_SETTINGS_KEY
        );
        if (emailRuleSettings?.blockReceiveUnknowAddressEmail) {
            const db_address_id = await env.DB.prepare(
                `SELECT id FROM address where name = ? `
            ).bind(message.to).first("id");
            if (!db_address_id) {
                message.setReject("Unknown address");
                console.log(`Unknown address mail from ${message.from} to ${message.to}`);
                return;
            }
        }
    } catch (error) {
        console.error("check unknown address mail error", error);
    }

    // remove attachment if configured or size > 2MB
    try {
        await remove_attachment_if_need(env, parsedEmailContext, message.from, message.to, message.rawSize);
    } catch (error) {
        console.error("remove attachment error", error);
    }

    const message_id = message.headers.get("Message-ID");
    
    let raw_headers = "";
    const parsed_headers: Record<string, any> = {};
    const security_info: Record<string, string> = {
        spf: "unknown",
        dkim: "unknown",
        dmarc: "unknown",
        raw_authentication_results: ""
    };

    try {
        for (const [key, value] of message.headers.entries()) {
            raw_headers += `${key}: ${value}\r\n`;
            const lowerKey = key.toLowerCase().replace(/-/g, '_');
            
            if (parsed_headers[lowerKey]) {
                if (Array.isArray(parsed_headers[lowerKey])) {
                    parsed_headers[lowerKey].push(value);
                } else {
                    parsed_headers[lowerKey] = [parsed_headers[lowerKey], value];
                }
            } else {
                if (lowerKey === 'received') {
                    parsed_headers[lowerKey] = [value];
                } else {
                    parsed_headers[lowerKey] = value;
                }
            }
        }

        const authResults = message.headers.get("Authentication-Results");
        if (authResults) {
            security_info.raw_authentication_results = authResults;
            const spfMatch = authResults.match(/spf=(\w+)/i);
            if (spfMatch) security_info.spf = spfMatch[1].toLowerCase();
            
            const dkimMatch = authResults.match(/dkim=(\w+)/i);
            if (dkimMatch) security_info.dkim = dkimMatch[1].toLowerCase();
            
            const dmarcMatch = authResults.match(/dmarc=(\w+)/i);
            if (dmarcMatch) security_info.dmarc = dmarcMatch[1].toLowerCase();
        }
    } catch (e) {
        console.error("Error parsing headers", e);
    }

    const parsed_headers_json = JSON.stringify(parsed_headers);
    const security_json = JSON.stringify(security_info);

    // save email
    try {
        let success = false;
        if (getBooleanValue(env.ENABLE_MAIL_GZIP)) {
            let compressed: ArrayBuffer | null = null;
            try {
                compressed = await compressText(parsedEmailContext.rawEmail);
            } catch (gzipError) {
                console.error("gzip compression failed, falling back to plaintext", gzipError);
            }
            if (compressed) {
                try {
                    ({ success } = await env.DB.prepare(
                        `INSERT INTO raw_mails (source, address, raw_blob, message_id, raw_headers, parsed_headers_json, security_json) VALUES (?, ?, ?, ?, ?, ?, ?)`
                    ).bind(
                        message.from, message.to, compressed, message_id, raw_headers, parsed_headers_json, security_json
                    ).run());
                } catch (dbError) {
                    const errMsg = String(dbError);
                    console.error("schema missing columns, falling back to plaintext old schema", dbError);
                    ({ success } = await env.DB.prepare(
                        `INSERT INTO raw_mails (source, address, raw, message_id) VALUES (?, ?, ?, ?)`
                    ).bind(
                        message.from, message.to, parsedEmailContext.rawEmail, message_id
                    ).run());
                }
            } else {
                try {
                    ({ success } = await env.DB.prepare(
                        `INSERT INTO raw_mails (source, address, raw, message_id, raw_headers, parsed_headers_json, security_json) VALUES (?, ?, ?, ?, ?, ?, ?)`
                    ).bind(
                        message.from, message.to, parsedEmailContext.rawEmail, message_id, raw_headers, parsed_headers_json, security_json
                    ).run());
                } catch (dbError) {
                    ({ success } = await env.DB.prepare(
                        `INSERT INTO raw_mails (source, address, raw, message_id) VALUES (?, ?, ?, ?)`
                    ).bind(
                        message.from, message.to, parsedEmailContext.rawEmail, message_id
                    ).run());
                }
            }
        } else {
            try {
                ({ success } = await env.DB.prepare(
                    `INSERT INTO raw_mails (source, address, raw, message_id, raw_headers, parsed_headers_json, security_json) VALUES (?, ?, ?, ?, ?, ?, ?)`
                ).bind(
                    message.from, message.to, parsedEmailContext.rawEmail, message_id, raw_headers, parsed_headers_json, security_json
                ).run());
            } catch (dbError) {
                ({ success } = await env.DB.prepare(
                    `INSERT INTO raw_mails (source, address, raw, message_id) VALUES (?, ?, ?, ?)`
                ).bind(
                    message.from, message.to, parsedEmailContext.rawEmail, message_id
                ).run());
            }
        }
        if (!success) {
            message.setReject(`Failed save message to ${message.to}`);
            console.error(`Failed save message from ${message.from} to ${message.to}`);
        }
    }
    catch (error) {
        console.error("save email error", error);
    }

    // forward email
    await forwardEmail(message, env);

    // send email to telegram
    try {
        await sendMailToTelegram(
            { env: env } as Context<HonoCustomType>,
            message.to, parsedEmailContext, message_id);
    } catch (error) {
        console.error("send mail to telegram error", error);
    }

    // send webhook
    try {
        await triggerWebhook(
            { env: env } as Context<HonoCustomType>,
            message.to, parsedEmailContext, message_id
        );
    } catch (error) {
        console.error("send webhook error", error);
    }

    // trigger another worker
    try {
        const parsedEmail = (await commonParseMail(parsedEmailContext));
        const parsedText = parsedEmail?.text ?? ""
        const rpcEmail: RPCEmailMessage = {
            from: message.from,
            to: message.to,
            rawEmail: rawEmail,
            headers: message.headers
        }
        await triggerAnotherWorker({ env: env } as Context<HonoCustomType>, rpcEmail, parsedText);
    } catch (error) {
        console.error("trigger another worker error", error);
    }

    // auto reply email
    await auto_reply(message, env);

    // AI email content extraction
    await extractEmailInfo(parsedEmailContext, env, message_id, message.to);
}

export { email }
