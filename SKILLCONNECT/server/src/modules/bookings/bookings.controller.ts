import type { NextFunction, Request, Response } from "express";
import { sendSuccess } from "../../lib/response.js";
import type { createBookingsService } from "./bookings.service.js";

export function createBookingsController(
  service: ReturnType<typeof createBookingsService>
) {
  const listMy = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const bookings = await service.listMyBookings(req.user!.id);
      sendSuccess(res, { bookings });
    } catch (err) {
      next(err);
    }
  };

  const getDetail = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const booking = await service.getBookingDetail(
        String(req.params.id),
        req.user!.id
      );
      sendSuccess(res, { booking });
    } catch (err) {
      next(err);
    }
  };

  const complete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const booking = await service.markComplete(
        String(req.params.id),
        req.user!.id
      );
      sendSuccess(res, { booking });
    } catch (err) {
      next(err);
    }
  };

  const confirm = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const booking = await service.confirmComplete(
        String(req.params.id),
        req.user!.id
      );
      sendSuccess(res, { booking });
    } catch (err) {
      next(err);
    }
  };

  const cancel = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const booking = await service.cancelBooking(
        String(req.params.id),
        req.user!.id,
        req.body.reason
      );
      sendSuccess(res, { booking });
    } catch (err) {
      next(err);
    }
  };

  const reportNoShow = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const booking = await service.reportNoShow(
        String(req.params.id),
        req.user!.id,
        req.body.reason
      );
      sendSuccess(res, { booking });
    } catch (err) {
      next(err);
    }
  };

  const respondNoShow = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const booking = await service.respondToNoShow(
        String(req.params.id),
        req.user!.id,
        req.body.action,
        req.body.response
      );
      sendSuccess(res, { booking });
    } catch (err) {
      next(err);
    }
  };

  const reportIssue = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const booking = await service.reportIssue(
        String(req.params.id),
        req.user!.id,
        req.body.reason
      );
      sendSuccess(res, { booking });
    } catch (err) {
      next(err);
    }
  };

  return {
    listMy,
    getDetail,
    complete,
    confirm,
    cancel,
    reportNoShow,
    respondNoShow,
    reportIssue,
  };
}
