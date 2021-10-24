const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () =>
      console.log("Server is Running at http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_KEY", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
  const dbUser = await db.get(selectUserQuery);
  console.log(dbUser);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createUserQuery = `
            INSERT INTO user (name, username, password, gender)
            VALUES(
                '${name}', '${username}', '${hashedPassword}', '${gender}'
            );
            `;
      await db.run(createUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatch = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatch === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "MY_SECRET_KEY");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let { username } = request;
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
  const dbUser = await db.get(selectUserQuery);
  const getFollowingUsersQuery = `
  SELECT following_user_id
  FROM follower
  WHERE follower_user_id = ${dbUser.user_id};
  `;
  const followingUsersList = await db.all(getFollowingUsersQuery);
  const followingUsersIdsList = followingUsersList.map(
    (eachUser) => eachUser.following_user_id
  );
  const getTweetsQuery = `
  SELECT username, tweet, date_time AS dateTime
  FROM user INNER JOIN tweet ON user.user_id = tweet.user_id
  WHERE tweet.user_id IN (${followingUsersIdsList})
  ORDER BY dateTime DESC
  LIMIT 4;
  `;
  const tweetsData = await db.all(getTweetsQuery);
  response.send(tweetsData);
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
  const dbUser = await db.get(selectUserQuery);
  const getFollowingUsersQuery = `
  SELECT following_user_id
  FROM follower
  WHERE follower_user_id = ${dbUser.user_id};
  `;
  const followingUsersList = await db.all(getFollowingUsersQuery);
  const followingUsersIdsList = followingUsersList.map(
    (eachUser) => eachUser.following_user_id
  );
  const getNamesQuery = `
  SELECT name
  FROM user
  WHERE user_id IN (${followingUsersIdsList});
  `;
  const namesData = await db.all(getNamesQuery);
  response.send(namesData);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
  const dbUser = await db.get(selectUserQuery);
  const getFollowersNamesQuery = `
  SELECT name
  FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id
  WHERE following_user_id = ${dbUser.user_id};
  `;
  const namesData = await db.all(getFollowersNamesQuery);
  response.send(namesData);
});

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
  const dbUser = await db.get(selectUserQuery);
  const getFollowingUsersQuery = `
  SELECT following_user_id
  FROM follower
  WHERE follower_user_id = ${dbUser.user_id};
  `;
  const followingUsersList = await db.all(getFollowingUsersQuery);
  const followingUsersIdsList = followingUsersList.map(
    (eachUser) => eachUser.following_user_id
  );
  if (followingUsersIdsList.includes(parseInt(tweetId))) {
    const getTweetQuery = `
      SELECT tweet,
      COUNT(DISTINCT like_id) AS likes,
      COUNT(DISTINCT reply_id) AS replies,
      tweet.date_time AS dateTime
      FROM (tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id) AS T
      INNER JOIN like ON tweet.tweet_id = like.tweet_id
      WHERE tweet.tweet_id = ${parseInt(tweetId)}
      `;
    const tweetsData = await db.get(getTweetQuery);
    response.send(tweetsData);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
    const dbUser = await db.get(selectUserQuery);
    const getFollowingUsersQuery = `
        SELECT following_user_id
        FROM follower
        WHERE follower_user_id = ${dbUser.user_id};
        `;
    const followingUsersList = await db.all(getFollowingUsersQuery);
    const followingUsersIdsList = followingUsersList.map(
      (eachUser) => eachUser.following_user_id
    );
    const getTweetIdsQuery = `
    SELECT tweet_id
    FROM tweet
    WHERE user_id IN (${followingUsersIdsList});
    `;
    const tweetIdsData = await db.all(getTweetIdsQuery);
    const tweetIdsList = tweetIdsData.map((eachTweet) => eachTweet.tweet_id);
    if (tweetIdsList.includes(parseInt(tweetId))) {
      const getTweetLikeNamesQuery = `
      SELECT username
      FROM like INNER JOIN user ON like.user_id = user.user_id
      WHERE like.tweet_id = ${parseInt(tweetId)};
      `;
      const namesData = await db.all(getTweetLikeNamesQuery);
      const namesList = namesData.map((eachName) => eachName.username);
      response.send({ likes: namesList });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
    const dbUser = await db.get(selectUserQuery);
    const getFollowingUsersQuery = `
        SELECT following_user_id
        FROM follower
        WHERE follower_user_id = ${dbUser.user_id};
        `;
    const followingUsersList = await db.all(getFollowingUsersQuery);
    const followingUsersIdsList = followingUsersList.map(
      (eachUser) => eachUser.following_user_id
    );
    const getTweetIdsQuery = `
    SELECT tweet_id
    FROM tweet
    WHERE user_id IN (${followingUsersIdsList});
    `;
    const tweetIdsData = await db.all(getTweetIdsQuery);
    const tweetIdsList = tweetIdsData.map((eachTweet) => eachTweet.tweet_id);
    if (tweetIdsList.includes(parseInt(tweetId))) {
      const getTweetReplyQuery = `
      SELECT name, reply
      FROM reply INNER JOIN user ON reply.user_id = user.user_id
      WHERE reply.tweet_id = ${parseInt(tweetId)};
      `;
      const replyData = await db.all(getTweetReplyQuery);
      response.send({
        replies: replyData.map((eachReply) => ({
          name: eachReply.name,
          reply: eachReply.reply,
        })),
      });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get("/user/tweets", authenticateToken, async (request, response) => {
  const { username } = request;
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
  const dbUser = await db.get(selectUserQuery);
  const getTweetsQuery = `
  SELECT tweet.tweet AS tweet,
  COUNT(DISTINCT like_id) AS likes,
  COUNT(DISTINCT reply_id) AS replies,
  tweet.date_time AS dateTime
  FROM (tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id) AS T
  INNER JOIN like ON tweet.tweet_id = like.tweet_id
  WHERE tweet.user_id = ${dbUser.user_id}
  GROUP BY tweet.tweet_id;
  `;
  const tweetsData = await db.all(getTweetsQuery);
  response.send(tweetsData);
});

app.post("/user/tweets", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
  const dbUser = await db.get(selectUserQuery);
  const newDate = new Date();
  const createTweetQuery = `
  INSERT INTO tweet (tweet, user_id, date_time)
  VALUES ('${tweet}', ${dbUser.user_id}, '${newDate}')
  `;
  await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

app.delete("/tweets/:tweetId", authenticateToken, async (request, response) => {
  const { username } = request;
  let { tweetId } = request.params;
  tweetId = parseInt(tweetId);
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
  const dbUser = await db.get(selectUserQuery);
  const getTweetIdsQuery = `
    SELECT tweet_id
    FROM tweet
    WHERE user_id = ${dbUser.user_id};
    `;
  const tweetIdsData = await db.all(getTweetIdsQuery);
  const tweetIdsList = tweetIdsData.map((eachTweet) => eachTweet.tweet_id);
  if (tweetIdsList.includes(tweetId)) {
    const deleteTweetQuery = `
      DELETE FROM tweet
      WHERE tweet_id = ${tweetId};
      `;
    await db.run(deleteTweetQuery);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

module.exports = app;
