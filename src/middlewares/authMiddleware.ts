import { validate, parse, type InitDataParsed } from '@tma.js/init-data-node';
import express, {
    type ErrorRequestHandler,
    type RequestHandler,
    type Response,
} from 'express';
import dotenv from "dotenv";
dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN ?? ''

/**
 * Sets init data in the specified Response object.
 * @param res - Response object.
 * @param initData - init data.
 */
function setInitData(res: Response, initData: InitDataParsed): void {
    res.locals.initData = initData;
}

/**
 * Extracts init data from the Response object.
 * @param res - Response object.
 * @returns Init data stored in the Response object. Can return undefined in case,
 * the client is not authorized.
 */
export function getInitData(res: Response): InitDataParsed | undefined {
    return res.locals.initData;
}

/**
 * Middleware which authorizes the external client.
 * @param req - Request object.
 * @param res - Response object.
 * @param next - function to call the next middleware.
 */
const authMiddleware: RequestHandler = (req, res, next) => {
    // We expect passing init data in the Authorization header in the following format:
    // <auth-type> <auth-data>
    // <auth-type> must be "tma", and <auth-data> is Telegram Mini Apps init data.
    const [authType, authData = ''] = (req.header('tma-authorization') || '').split(' ');

    switch (authType) {
        case 'tma':
            try {
                // Validate init data.
                // validate(authData, BOT_TOKEN, {
                //     // We consider init data sign valid for 1 hour from their creation moment.
                //     expiresIn: 36000000,
                // });

                // Parse init data. We will surely need it in the future.
                setInitData(res, parse(authData));
                return next();
            } catch (e) {
                return next(e);
            }
        // ... other authorization methods.
        default:
            return next(new Error('Unauthorized'));
    }
};

export default authMiddleware