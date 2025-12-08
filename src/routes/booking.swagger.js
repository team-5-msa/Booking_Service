/**
 * @swagger
 * /booking:
 *   get:
 *     summary: Get all bookings
 *     description: Retrieve a list of all bookings.
 *     responses:
 *       200:
 *         description: A list of bookings.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   user:
 *                     type: string
 *                   performance:
 *                     type: string
 *                   quantity:
 *                     type: integer
 *                   status:
 *                     type: string
 *   post:
 *     summary: Create a new booking
 *     description: Create a booking with the provided details.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               performanceId:
 *                 type: string
 *               quantity:
 *                 type: integer
 *               paymentMethod:
 *                 type: string
 *     responses:
 *       201:
 *         description: Booking created successfully.
 *       400:
 *         description: Invalid input data.
 */
