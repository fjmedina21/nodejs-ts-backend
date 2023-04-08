import { Response, Request } from "express";
import { UploadedFile } from "express-fileupload";
import fs from "fs-extra";

import { User } from "../models";
import { PhotoDelete, PhotoUpload, PhotoUpdate, ErrorHandler, } from "../helpers";

export async function GetUsers(req: Request, res: Response) {
	const { from = 0, limit = 20 } = req.query;

	try {
		const [users, total]: [User[], number] =
			(await User.findAndCount({
				where: { state: true },
				order: { updatedAt: "DESC", createdAt: "DESC" },
				skip: Number(from),
				take: Number(limit),
			})) || [];

		return res.status(200).json({ result: { ok: true, total, users } });
	} catch (error: unknown) {
		if (error instanceof Error)
			return res.status(500).json({ result: { ok: false, message: error.message } });
	}
}

export async function GetUser(req: Request, res: Response) {
	const { id } = req.params;

	try {
		const user: User = await User.findOneByOrFail({ uId: id, state: true }) || {};
		const { photo, ...data } = user;

		return res.status(200).json({ result: { ok: true, user: data } });
	} catch (error: unknown) {
		if (error instanceof Error)
			return res.status(500).json({ result: { ok: false, message: error.message } });
	}
}

export async function CreateUser(req: Request, res: Response) {
	const { firstName, lastName, email, password, isAdmin } = req.body;
	const photoFile = req.files?.photo as UploadedFile;

	try {
		const user: User = new User();
		user.firstName = firstName;
		user.lastName = lastName;
		user.email = email;
		user.isAdmin = Boolean(isAdmin);
		user.hashPassword(password);
		user.photo = { public_id: "", secure_url: "" };

		if (photoFile) {
			await PhotoUpload(photoFile, "users")
				.then(({ public_id, secure_url }) => { user.photo = { public_id, secure_url }; })
				.catch((reason) => { throw new Error(reason); });
		}

		await user.save();
		return res.status(201).json({ result: { ok: true, message:"User created" }, });
	} catch (error: unknown) {
		if (error instanceof Error)
			return res.status(500).json({ result: { ok: false, message: error.message } });
	} finally {
		if (photoFile) await fs.unlink(photoFile.tempFilePath);
	}
}

export async function UpdateUser(req: Request, res: Response) {
	const { id } = req.params;
	const { confirmPassword, ...payload } = req.body;
	const photoFile = req.files?.photo as UploadedFile;

	try {
		const user: User = await User.findOneOrFail({
			select: ["firstName", "lastName", "email", "password"],
			where: { uId: id },
		});

		if (!user.comparePassword(confirmPassword))
			throw new ErrorHandler("Your password is incorrect", 400);

		if (photoFile) {
			await PhotoUpdate(user.photo.public_id, photoFile, "users")
				.then(async ({ public_id, secure_url }) => await User.update({ uId: id }, { photo: { public_id, secure_url } }))
				.catch((reason) => { throw new Error(reason); });
		}

		await User.update({ uId: id }, payload);
		return res.status(200).json({ result: { ok: true, message: "User updated" } });
	} catch (error: unknown) {
		if (error instanceof ErrorHandler)
			return res.status(error.statusCode).json({ result: error.toJson() });

		if (error instanceof Error)
			return res.status(500).json({ result: { ok: false, message: error.message } });
	}
}

export async function DeleteUser(req: Request, res: Response) {
	const { id } = req.params;

	try {
		const { photo } = await User.findOneByOrFail({ uId: id });
		if (photo) await PhotoDelete(photo.public_id);

		await User.update(
			{ uId: id },
			{ state: false, isUser: false, isAdmin: false, photo: { public_id: "", secure_url: "" } }
		);

		return res.status(204).json();
	} catch (error: unknown) {
		if (error instanceof Error)
			return res.status(500).json({ result: { ok: false, message: error.message } });
	}
}
